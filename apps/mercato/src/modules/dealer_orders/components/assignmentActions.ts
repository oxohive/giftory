/**
 * Client-side orchestration for the admin order-assignment tab's three
 * write actions (assign / reassign / cancel), kept as plain async functions
 * (no JSX, no hooks) — mirrors the precedent in
 * `dealer_onboarding/components/reviewActions.ts`. The server
 * (`dealer_orders/commands/assignments.ts`, outside this task's owned
 * paths) remains the sole authority: an unpaid order, a missing active
 * assignment, or a feature the caller lacks is rejected there regardless of
 * what this layer does. This layer exists so the dialogs can tell a real
 * validation/business-rule rejection apart from a permission or
 * conflict/stale-state outcome, without each dialog re-deriving that logic.
 *
 * Real, verified status/code shapes (API-CONTRACTS.md + `lib/http.ts` +
 * `commands/assignments.ts`, both outside this task's owned paths):
 *   - 401/403            -> caller unauthenticated / missing `dealer_orders.manage`
 *   - 400                -> on assign/reassign, the ONLY `badRequest` in either
 *                           command is `assertOrderIsPaid` — "order must be paid"
 *   - 404                -> "assignment not found" (reassign/cancel: no active
 *                           assignment to act on)
 *   - 409                -> assign only: an active assignment already exists
 *                           (conflict — "someone already assigned this order")
 *   - 422                -> request body failed zod validation
 *   - 400 idempotency_key_required -> missing `Idempotency-Key` header
 *     (should never happen from these dialogs, which always send one, but
 *     classified distinctly rather than folded into "order not paid")
 */

export type AssignmentActionErrorCode =
  | 'validation'
  | 'forbidden'
  | 'conflict'
  | 'not_found'
  | 'order_not_paid'
  | 'idempotency_key_required'
  | 'request_failed'

export type AssignmentActionError = { code: AssignmentActionErrorCode; message: string }

export type AssignmentActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AssignmentActionError }

function statusOf(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | undefined)?.status
  return typeof status === 'number' ? status : undefined
}

function serverCodeOf(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | undefined)?.code
  return typeof code === 'string' ? code : undefined
}

function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : ''
}

/**
 * Shared status->code mapping for `not_found`/`conflict`/`forbidden`/
 * `validation`, used by both the assign/reassign classifier (which adds its
 * own 400 -> `order_not_paid` mapping) and cancel (which has no 400 case in
 * the real contract today, so it falls through to the generic default).
 */
function classifyCommon(status: number | undefined, message: string): AssignmentActionError | null {
  if (status === 401 || status === 403) return { code: 'forbidden', message }
  if (status === 404) return { code: 'not_found', message }
  if (status === 409) return { code: 'conflict', message }
  if (status === 422) return { code: 'validation', message }
  return null
}

function classifyAssignmentFailure(err: unknown): AssignmentActionError {
  const status = statusOf(err)
  const serverCode = serverCodeOf(err)
  const message = messageOf(err)
  if (status === 400 && serverCode === 'idempotency_key_required') {
    return { code: 'idempotency_key_required', message }
  }
  const common = classifyCommon(status, message)
  if (common) return common
  // The only remaining 400 on assign/reassign is `assertOrderIsPaid` — see
  // module doc comment above.
  if (status === 400) return { code: 'order_not_paid', message }
  return { code: 'request_failed', message }
}

function classifyCancelFailure(err: unknown): AssignmentActionError {
  const status = statusOf(err)
  const message = messageOf(err)
  const common = classifyCommon(status, message)
  if (common) return common
  return { code: 'request_failed', message }
}

// ── Assign ────────────────────────────────────────────────────────────────────

export type AssignOrderBody = { dealerProfileId: string; requiredBy: string }

export type SubmitAssignInput = {
  dealerProfileId: string
  requiredBy: string
  post: (body: AssignOrderBody) => Promise<{ id: string }>
}

export async function submitAssignOrder(input: SubmitAssignInput): Promise<AssignmentActionResult<{ id: string }>> {
  if (!input.dealerProfileId) {
    return { ok: false, error: { code: 'validation', message: 'dealer_required' } }
  }
  if (!input.requiredBy) {
    return { ok: false, error: { code: 'validation', message: 'required_by_required' } }
  }
  try {
    const data = await input.post({ dealerProfileId: input.dealerProfileId, requiredBy: input.requiredBy })
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: classifyAssignmentFailure(err) }
  }
}

// ── Reassign ──────────────────────────────────────────────────────────────────

export type ReassignOrderBody = { dealerProfileId: string; requiredBy: string; reason?: string }

export type SubmitReassignInput = {
  dealerProfileId: string
  requiredBy: string
  reason?: string
  post: (body: ReassignOrderBody) => Promise<{ id: string }>
}

export async function submitReassignOrder(input: SubmitReassignInput): Promise<AssignmentActionResult<{ id: string }>> {
  if (!input.dealerProfileId) {
    return { ok: false, error: { code: 'validation', message: 'dealer_required' } }
  }
  if (!input.requiredBy) {
    return { ok: false, error: { code: 'validation', message: 'required_by_required' } }
  }
  const reason = input.reason?.trim()
  try {
    const data = await input.post({
      dealerProfileId: input.dealerProfileId,
      requiredBy: input.requiredBy,
      ...(reason ? { reason } : {}),
    })
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: classifyAssignmentFailure(err) }
  }
}

// ── Cancel ────────────────────────────────────────────────────────────────────

export type SubmitCancelInput = {
  reason: string
  post: (body: { reason: string }) => Promise<void>
}

export async function submitCancelAssignment(input: SubmitCancelInput): Promise<AssignmentActionResult<void>> {
  const reason = input.reason.trim()
  if (reason.length === 0) {
    return { ok: false, error: { code: 'validation', message: 'reason_required' } }
  }
  try {
    await input.post({ reason })
    return { ok: true, data: undefined }
  } catch (err) {
    return { ok: false, error: classifyCancelFailure(err) }
  }
}

/**
 * `requiredBy` must be a future `YYYY-MM-DD` date — mirrors
 * `data/validators.ts`'s `assignOrderSchema`/`reassignOrderSchema` regex +
 * future-date refinement (outside this task's owned paths) as a client-side
 * UX nicety only; the server re-validates unconditionally.
 */
export function isFutureDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.getTime() > Date.now()
}

/** Formats a `Date` as a local-timezone `YYYY-MM-DD` string (no UTC shift). */
export function formatDateOnly(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
