import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { isUniqueViolation } from '@open-mercato/shared/lib/crud/errors'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { hashRequest, normalizeIdempotencyKey } from '@/modules/storefront/lib/idempotency'
import { DealerOrderIdempotencyKey } from '../data/entities'
import { DealerOrdersError, type Translate } from './errors'

/**
 * `Idempotency-Key` replay for the admin assignment writes
 * (`POST`/`PUT /admin/orders/{id}/assignment`).
 *
 * Reuses the repo's Phase 1 mechanism (`storefront/lib/idempotency.ts` +
 * `storefront/lib/checkout.ts`'s claim): the same key validation
 * (`normalizeIdempotencyKey`), the same request fingerprint (`hashRequest`),
 * and a module-owned table unique on (tenant_id, organization_id,
 * idempotency_key) holding a claim that becomes the stored outcome.
 *
 *   - same key + same payload, already completed → stored response replayed
 *     (same status + body, `Idempotent-Replayed: true`); the command does not run.
 *   - same key + different payload (or other operation/order) → 409
 *     `idempotency_key_reused`.
 *   - same key + same payload while the first request is still running → 409
 *     `idempotency_request_in_progress` (retry shortly).
 *   - the command fails → the claim is deleted, so the key can be retried
 *     (even with a corrected body — the dialog keeps its key across a
 *     validation error).
 *   - a claim left `processing` for longer than the stale window (process
 *     crashed mid-request) is taken over by a same-payload retry.
 *
 * The assignment commands run through the command bus and emit events, so
 * the claim is NOT in the same DB transaction as the assignment (unlike the
 * payouts ledger). If the process dies after the assignment is written but
 * before the claim is marked completed, a retry after the stale window
 * re-executes: `assign` then fails safely with 409 (active assignment exists);
 * `reassign` would reassign again to the same dealer. That window is a crash
 * between two consecutive statements and is documented in the WS-A handoff.
 */

const logger = createLogger('dealer_orders').child({ component: 'idempotency' })

export const ASSIGNMENT_IDEMPOTENCY_OPERATIONS = ['assign', 'reassign'] as const
export type AssignmentIdempotencyOperation = (typeof ASSIGNMENT_IDEMPOTENCY_OPERATIONS)[number]

export const DEALER_ORDER_IDEMPOTENCY_UNIQUE_CONSTRAINT = 'dealer_order_idempotency_keys_scope_key_uniq'
export const IDEMPOTENT_REPLAY_HEADER = 'Idempotent-Replayed'
/** Same window as the storefront checkout claim (`CHECKOUT_CLAIM_STALE_MS`). */
export const ASSIGNMENT_CLAIM_STALE_MS = 2 * 60 * 1000

export type AssignmentIdempotencyScope = { tenantId: string; organizationId: string }
export type StoredAssignmentResponse = { status: number; body: Record<string, unknown> }

export function requireIdempotencyKey(req: Request, translate: Translate): string {
  const raw = req.headers.get('Idempotency-Key')
  if (raw === null || raw.trim().length === 0) {
    throw new DealerOrdersError(
      400,
      'idempotency_key_required',
      translate('dealer_orders.errors.idempotencyKeyRequired', 'Idempotency-Key header is required for this operation'),
    )
  }
  const key = normalizeIdempotencyKey(raw)
  if (!key) {
    throw new DealerOrdersError(
      400,
      'idempotency_key_invalid',
      translate(
        'dealer_orders.errors.idempotencyKeyInvalid',
        'Idempotency-Key must be 16-128 characters of letters, digits, "-", "_", ":" or "."',
      ),
    )
  }
  return key
}

export function hashAssignmentRequest(
  operation: AssignmentIdempotencyOperation,
  orderId: string,
  body: Record<string, unknown>,
): string {
  return hashRequest({ operation, orderId, body })
}

type ExistingClaim = Pick<
  DealerOrderIdempotencyKey,
  'id' | 'operation' | 'requestHash' | 'status' | 'claimedAt' | 'responseStatus' | 'responseBody'
>

export type ClaimDecision =
  | { kind: 'replay'; response: StoredAssignmentResponse }
  | { kind: 'mismatch' }
  | { kind: 'in_progress' }
  | { kind: 'reclaim' }

/** Pure decision for a key that already has a row. */
export function decideExistingClaim(
  existing: ExistingClaim,
  operation: AssignmentIdempotencyOperation,
  requestHash: string,
  now: Date,
  staleMs: number = ASSIGNMENT_CLAIM_STALE_MS,
): ClaimDecision {
  if (existing.operation !== operation || existing.requestHash !== requestHash) return { kind: 'mismatch' }
  if (existing.status === 'completed' && typeof existing.responseStatus === 'number') {
    return { kind: 'replay', response: { status: existing.responseStatus, body: existing.responseBody ?? {} } }
  }
  const claimedAt = existing.claimedAt instanceof Date ? existing.claimedAt.getTime() : new Date(existing.claimedAt).getTime()
  if (Number.isFinite(claimedAt) && now.getTime() - claimedAt < staleMs) return { kind: 'in_progress' }
  return { kind: 'reclaim' }
}

function reusedError(translate: Translate): DealerOrdersError {
  return new DealerOrdersError(
    409,
    'idempotency_key_reused',
    translate('dealer_orders.errors.idempotencyKeyReused', 'This Idempotency-Key was already used for a different request'),
  )
}

function inProgressError(translate: Translate): DealerOrdersError {
  return new DealerOrdersError(
    409,
    'idempotency_request_in_progress',
    translate('dealer_orders.errors.idempotencyInProgress', 'A request with this Idempotency-Key is still being processed. Retry shortly.'),
  )
}

export type ClaimResult =
  | { kind: 'claimed'; claimId: string }
  | { kind: 'replay'; response: StoredAssignmentResponse }

/**
 * Insert-or-inspect the scoped key. Returns a claim to execute under, or a
 * stored response to replay; throws 409 for mismatch / in-progress.
 */
export async function claimAssignmentKey(args: {
  em: EntityManager
  scope: AssignmentIdempotencyScope
  idempotencyKey: string
  operation: AssignmentIdempotencyOperation
  requestHash: string
  translate: Translate
  now?: () => Date
}): Promise<ClaimResult> {
  const { scope, idempotencyKey, operation, requestHash, translate } = args
  const now = args.now ?? (() => new Date())
  const where = {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    idempotencyKey,
  } as FilterQuery<DealerOrderIdempotencyKey>

  const em = args.em.fork()
  let existing = await em.findOne(DealerOrderIdempotencyKey, where)
  if (!existing) {
    const at = now()
    const claim = em.create(DealerOrderIdempotencyKey, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      idempotencyKey,
      operation,
      requestHash,
      status: 'processing',
      claimedAt: at,
      responseStatus: null,
      responseBody: null,
      createdAt: at,
      updatedAt: at,
    })
    em.persist(claim)
    try {
      await em.flush()
      return { kind: 'claimed', claimId: String(claim.id) }
    } catch (err) {
      if (!isUniqueViolation(err, DEALER_ORDER_IDEMPOTENCY_UNIQUE_CONSTRAINT)) throw err
      const fresh = args.em.fork()
      existing = await fresh.findOne(DealerOrderIdempotencyKey, where)
      if (!existing) throw inProgressError(translate)
    }
  }

  const decision = decideExistingClaim(existing, operation, requestHash, now())
  if (decision.kind === 'replay') return decision
  if (decision.kind === 'mismatch') throw reusedError(translate)
  if (decision.kind === 'in_progress') throw inProgressError(translate)

  // Stale `processing` claim with the same payload: take it over atomically —
  // only one retry can win the compare-and-set on the old claimed_at.
  const taken = await args.em.fork().nativeUpdate(
    DealerOrderIdempotencyKey,
    { id: existing.id, status: 'processing', claimedAt: existing.claimedAt } as FilterQuery<DealerOrderIdempotencyKey>,
    { claimedAt: now(), updatedAt: now() },
  )
  if (taken === 0) throw inProgressError(translate)
  return { kind: 'claimed', claimId: String(existing.id) }
}

/** Record the outcome so later requests with this key replay it. */
export async function completeAssignmentClaim(
  em: EntityManager,
  claimId: string,
  response: StoredAssignmentResponse,
): Promise<void> {
  await em.fork().nativeUpdate(
    DealerOrderIdempotencyKey,
    { id: claimId, status: 'processing' } as FilterQuery<DealerOrderIdempotencyKey>,
    { status: 'completed', responseStatus: response.status, responseBody: response.body, updatedAt: new Date() },
  )
}

/** Drop a claim whose command failed, so the key can be retried. */
export async function releaseAssignmentClaim(em: EntityManager, claimId: string): Promise<void> {
  await em.fork().nativeDelete(DealerOrderIdempotencyKey, { id: claimId, status: 'processing' } as FilterQuery<DealerOrderIdempotencyKey>)
}

export function replayResponse(stored: StoredAssignmentResponse): Response {
  return Response.json(stored.body, { status: stored.status, headers: { [IDEMPOTENT_REPLAY_HEADER]: 'true' } })
}

/**
 * Route-level driver: claim → run → complete (or release on failure), or
 * replay a stored outcome.
 */
export async function runIdempotentAssignmentWrite(args: {
  em: EntityManager
  scope: AssignmentIdempotencyScope
  idempotencyKey: string
  operation: AssignmentIdempotencyOperation
  requestHash: string
  translate: Translate
  execute: () => Promise<StoredAssignmentResponse>
}): Promise<Response> {
  const claim = await claimAssignmentKey(args)
  if (claim.kind === 'replay') return replayResponse(claim.response)

  let response: StoredAssignmentResponse
  try {
    response = await args.execute()
  } catch (err) {
    await releaseAssignmentClaim(args.em, claim.claimId).catch((releaseErr: unknown) => {
      logger.warn('Failed to release assignment idempotency claim', { err: releaseErr })
    })
    throw err
  }
  try {
    await completeAssignmentClaim(args.em, claim.claimId, response)
  } catch (err) {
    // The assignment exists; only the replay record failed. Return success —
    // a later same-key retry sees a stale claim (see module doc).
    logger.warn('Failed to complete assignment idempotency claim', { err })
  }
  return Response.json(response.body, { status: response.status })
}
