import { parseRupeesToPaise } from './money'

/**
 * Client-side pre-validation + submission orchestration for the two ledger
 * mutation dialogs. Deliberately kept as plain async functions (no JSX, no
 * hooks) so the failure-recovery and validation behavior required by this
 * task's acceptance criteria can be unit-tested directly, without mounting a
 * dialog component.
 *
 * The server (`recordPayoutSchema` / `createAdjustmentSchema` in
 * `payouts/data/validators.ts`, outside this task's owned paths) remains the
 * authoritative validator — zero/negative/fractional amounts and a missing
 * note are rejected there regardless of what this layer does. This layer
 * exists so the UI gives immediate feedback and never fires a request it
 * already knows is invalid, per this app's "no float arithmetic on money"
 * and "disable duplicate submits" UI conventions.
 */

export type LedgerMutationError =
  | { code: 'invalid_amount'; message: string }
  | { code: 'missing_note'; message: string }
  /** Server 422 `insufficient_balance` (payout > dealer's pendingAmount). */
  | { code: 'insufficient_balance'; message: string; availableAmount: number | null }
  /** Server 409 `idempotency_key_reused`: this dialog's key already recorded a DIFFERENT request. */
  | { code: 'idempotency_conflict'; message: string }
  | { code: 'request_failed'; message: string }

export type LedgerMutationResult =
  | { ok: true; id: string }
  | { ok: false; error: LedgerMutationError }

export type RecordPayoutInput = {
  amountRaw: string
  note: string
  /** Performs the POST; the caller attaches the dialog's `Idempotency-Key` header. */
  post: (body: { amount: number; note: string }) => Promise<{ id: string }>
}

function errorMessageOf(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

/**
 * Maps a thrown server error (`apiCallOrThrow` copies the JSON body's `code`
 * and extra fields onto the error) to a structured failure. Anything
 * unrecognised stays the generic `request_failed`.
 */
export function classifyLedgerMutationFailure(err: unknown): LedgerMutationError {
  const message = errorMessageOf(err, '')
  const record = (err && typeof err === 'object' ? err : {}) as Record<string, unknown>
  if (record.code === 'insufficient_balance') {
    const available = record.availableAmount
    return {
      code: 'insufficient_balance',
      message,
      availableAmount: typeof available === 'number' && Number.isSafeInteger(available) ? available : null,
    }
  }
  if (record.code === 'idempotency_key_reused') return { code: 'idempotency_conflict', message }
  return { code: 'request_failed', message }
}

/**
 * Validate and submit a manual payout record. On a thrown error from `post`
 * (network failure, server 4xx/5xx), this returns a structured failure
 * instead of throwing — the caller (the dialog) keeps the entered amount/note
 * untouched and the dialog open, so the admin can see what happened and
 * retry or cancel. Nothing here mutates on failure and nothing here retries
 * automatically.
 */
export async function submitRecordPayout(input: RecordPayoutInput): Promise<LedgerMutationResult> {
  const paise = parseRupeesToPaise(input.amountRaw)
  if (paise == null || paise <= 0) {
    return { ok: false, error: { code: 'invalid_amount', message: 'invalid_amount' } }
  }
  const note = input.note.trim()
  if (note.length === 0) {
    return { ok: false, error: { code: 'missing_note', message: 'missing_note' } }
  }
  try {
    const result = await input.post({ amount: paise, note })
    return { ok: true, id: result.id }
  } catch (err) {
    return { ok: false, error: classifyLedgerMutationFailure(err) }
  }
}

export type CreateAdjustmentInput = {
  direction: 'credit' | 'debit'
  amountRaw: string
  note: string
  post: (body: { direction: 'credit' | 'debit'; amount: number; note: string }) => Promise<{ id: string }>
}

/** Same contract as `submitRecordPayout`, for the credit/debit adjustment dialog. */
export async function submitCreateAdjustment(input: CreateAdjustmentInput): Promise<LedgerMutationResult> {
  const paise = parseRupeesToPaise(input.amountRaw)
  if (paise == null || paise <= 0) {
    return { ok: false, error: { code: 'invalid_amount', message: 'invalid_amount' } }
  }
  const note = input.note.trim()
  if (note.length === 0) {
    return { ok: false, error: { code: 'missing_note', message: 'missing_note' } }
  }
  try {
    const result = await input.post({ direction: input.direction, amount: paise, note })
    return { ok: true, id: result.id }
  } catch (err) {
    return { ok: false, error: classifyLedgerMutationFailure(err) }
  }
}
