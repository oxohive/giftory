import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { hashRequest, normalizeIdempotencyKey } from '@/modules/storefront/lib/idempotency'
import { PayoutsIdempotencyKey } from '../data/entities'
import { PayoutsError, type Translate } from './errors'

/**
 * `Idempotency-Key` replay for the admin ledger write routes.
 *
 * Reuses the repo's existing mechanism (Phase 1 order placement,
 * `storefront/lib/idempotency.ts` + `storefront_checkouts`): the header is
 * validated with the same `normalizeIdempotencyKey` rules, the request is
 * bound to the key by a SHA-256 of its canonical JSON (`hashRequest`), and the
 * key is stored in a module-owned table unique on
 * (tenant_id, organization_id, idempotency_key).
 *
 * Semantics:
 *   - same key + same payload  → the stored response is replayed
 *     (same status, same body, `Idempotent-Replayed: true`); nothing executes.
 *   - same key + different payload (or different route/dealer) → 409
 *     `idempotency_key_reused`; nothing executes.
 *   - a request that fails stores nothing, so the key may be retried.
 *
 * Unlike the storefront there is no "processing" claim row: the key row is
 * written in the same transaction as the ledger entry (see
 * `commands/entries.ts`), so it exists exactly when the entry does. A
 * concurrent duplicate either sees it under the per-dealer advisory lock or
 * hits the unique constraint; both surface as `LedgerIdempotencyRaceError`,
 * and the route then replays from the committed row.
 */

export const LEDGER_IDEMPOTENCY_OPERATIONS = ['record_payout', 'create_adjustment'] as const
export type LedgerIdempotencyOperation = (typeof LEDGER_IDEMPOTENCY_OPERATIONS)[number]

export const PAYOUTS_IDEMPOTENCY_UNIQUE_CONSTRAINT = 'payouts_idempotency_keys_scope_key_uniq'
export const IDEMPOTENT_REPLAY_HEADER = 'Idempotent-Replayed'

export type LedgerIdempotencyScope = { tenantId: string; organizationId: string }

export type LedgerIdempotencyContext = {
  idempotencyKey: string
  requestHash: string
  operation: LedgerIdempotencyOperation
}

export type StoredLedgerResponse = { status: number; body: Record<string, unknown> }

/** HTTP status + body every successful ledger write returns, and that a replay re-serves. */
export const LEDGER_WRITE_SUCCESS_STATUS = 201
export function ledgerWriteResponseBody(entry: { id: string }): Record<string, unknown> {
  return { id: String(entry.id) }
}

// Symbol.for so the marker survives module duplication across bundle
// boundaries (same reasoning as core's ShipmentIdempotencyConflictError).
const RACE_MARKER = Symbol.for('giftory/payouts/LedgerIdempotencyRaceError')

/**
 * Thrown by a ledger write command when another request already consumed
 * this key (seen under the dealer lock, or lost the unique-constraint race).
 * The command's transaction has rolled back; the caller replays instead.
 */
export class LedgerIdempotencyRaceError extends Error {
  readonly [RACE_MARKER] = true
  constructor() {
    super('[internal] payouts idempotency key already consumed')
    this.name = 'LedgerIdempotencyRaceError'
  }
}

export function isLedgerIdempotencyRaceError(err: unknown): err is LedgerIdempotencyRaceError {
  return !!err && typeof err === 'object' && (err as Record<symbol, unknown>)[RACE_MARKER] === true
}

/** Reads and validates the `Idempotency-Key` header (required on ledger writes). */
export function requireLedgerIdempotencyKey(req: Request, translate: Translate): string {
  const raw = req.headers.get('Idempotency-Key')
  if (raw === null || raw.trim().length === 0) {
    throw new PayoutsError(
      400,
      'idempotency_key_required',
      translate('payouts.errors.idempotencyKeyRequired', 'Idempotency-Key header is required for this operation'),
    )
  }
  const key = normalizeIdempotencyKey(raw)
  if (!key) {
    throw new PayoutsError(
      400,
      'idempotency_key_invalid',
      translate(
        'payouts.errors.idempotencyKeyInvalid',
        'Idempotency-Key must be 16-128 characters of letters, digits, "-", "_", ":" or "."',
      ),
    )
  }
  return key
}

/** Canonical request fingerprint: the operation, the target dealer and the validated body. */
export function hashLedgerRequest(
  operation: LedgerIdempotencyOperation,
  dealerProfileId: string,
  body: Record<string, unknown>,
): string {
  return hashRequest({ operation, dealerProfileId, body })
}

/**
 * Looks up a stored outcome for this scoped key. Returns it when the request
 * matches, `null` when the key is unused, and throws 409 when the key was
 * used for a different request.
 */
export async function findLedgerReplay(
  em: Pick<EntityManager, 'findOne'>,
  scope: LedgerIdempotencyScope,
  ctx: LedgerIdempotencyContext,
  translate: Translate,
): Promise<StoredLedgerResponse | null> {
  const existing = await em.findOne(PayoutsIdempotencyKey, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    idempotencyKey: ctx.idempotencyKey,
  } as FilterQuery<PayoutsIdempotencyKey>)
  if (!existing) return null
  if (existing.operation !== ctx.operation || existing.requestHash !== ctx.requestHash) {
    throw new PayoutsError(
      409,
      'idempotency_key_reused',
      translate(
        'payouts.errors.idempotencyKeyReused',
        'This Idempotency-Key was already used for a different request. Refresh the ledger before trying again.',
      ),
    )
  }
  return { status: existing.responseStatus, body: existing.responseBody ?? {} }
}

export function replayResponse(stored: StoredLedgerResponse): NextResponse {
  return NextResponse.json(stored.body, { status: stored.status, headers: { [IDEMPOTENT_REPLAY_HEADER]: 'true' } })
}

/**
 * Route-level driver: replay if the key is already stored, otherwise run the
 * write; if the write reports that a concurrent request consumed the key
 * first, replay from (or reject against) the now-committed row.
 */
export async function runIdempotentLedgerWrite(args: {
  em: EntityManager
  scope: LedgerIdempotencyScope
  ctx: LedgerIdempotencyContext
  translate: Translate
  execute: () => Promise<StoredLedgerResponse>
}): Promise<NextResponse> {
  const { em, scope, ctx, translate, execute } = args
  const stored = await findLedgerReplay(em.fork(), scope, ctx, translate)
  if (stored) return replayResponse(stored)
  try {
    const fresh = await execute()
    return NextResponse.json(fresh.body, { status: fresh.status })
  } catch (err) {
    if (!isLedgerIdempotencyRaceError(err)) throw err
    const winner = await findLedgerReplay(em.fork(), scope, ctx, translate)
    if (winner) return replayResponse(winner)
    // The other request's row is gone (it can only disappear if its
    // transaction rolled back after we observed it): ask the client to retry.
    throw new PayoutsError(
      409,
      'idempotency_request_in_progress',
      translate('payouts.errors.idempotencyInProgress', 'A request with this Idempotency-Key is still being processed. Retry shortly.'),
    )
  }
}
