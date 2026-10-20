/**
 * Client-side orchestration for the admin approve/reject decision, kept as
 * plain async functions (no JSX, no hooks) — mirrors the precedent in
 * `payouts/components/ledgerActions.ts`. The server
 * (`commands/review.ts::executeApprove`/`executeReject`, outside this task's
 * owned paths) remains the authoritative gate: a missing reason or a status
 * that no longer allows the requested transition is rejected there
 * regardless of what this layer does. This layer exists so the review
 * screen gives immediate feedback and can tell a genuine validation problem
 * apart from a "someone already acted on this application" race.
 *
 * **Real contract, not the literal word "409":** `executeApprove`/
 * `executeReject` throw `badRequest()` (HTTP 400, `code: "request_failed"`)
 * for every "wrong current status" case — "already approved", "already
 * rejected", "not under review", "approved dealer cannot be rejected" (see
 * `commands/review.ts` and `review.commands.test.ts`, both outside this
 * task's owned paths). There is no literal 409 anywhere in this module's
 * real responses today. This task's acceptance criteria ask for a "409
 * (conflict)" UI state; since the actual, verified status code for this
 * exact race is 400, `isReviewConflictStatus` below treats BOTH 400 and 409
 * as the same "someone already decided this application — refresh and show
 * the real status" outcome, so the UI is correct against the real contract
 * today and would stay correct if a future backend change switched this
 * specific case to a literal 409.
 */

export type ReviewActionError =
  | { code: 'missing_reason'; message: string }
  | { code: 'forbidden'; message: string }
  | { code: 'conflict'; message: string }
  | { code: 'request_failed'; message: string }

export type ReviewActionResult =
  | { ok: true }
  | { ok: false; error: ReviewActionError }

/** 400 and 409 are both treated as "this application's status already changed" — see module doc comment above. */
export function isReviewConflictStatus(status: number | undefined | null): boolean {
  return status === 400 || status === 409
}

function errorMessageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : ''
}

function statusOf(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | undefined)?.status
  return typeof status === 'number' ? status : undefined
}

function classifyFailure(err: unknown): ReviewActionError {
  const status = statusOf(err)
  const message = errorMessageOf(err)
  if (status === 401 || status === 403) return { code: 'forbidden', message }
  if (isReviewConflictStatus(status)) return { code: 'conflict', message }
  return { code: 'request_failed', message }
}

export type SubmitApproveInput = {
  post: () => Promise<void>
}

/**
 * Submits an approve decision. On a thrown error from `post` (network
 * failure, server 4xx/5xx), returns a structured failure instead of
 * throwing, so the dialog/page can decide how to react (refetch on
 * conflict, show an access-denied state on 401/403, flash a generic error
 * otherwise) without needing to parse the error itself.
 */
export async function submitApproveApplication(input: SubmitApproveInput): Promise<ReviewActionResult> {
  try {
    await input.post()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: classifyFailure(err) }
  }
}

export type SubmitRejectInput = {
  reason: string
  post: (body: { reason: string }) => Promise<void>
}

/**
 * Submits a reject decision. The reason is required client-side before any
 * request is sent (the server independently enforces 1–2000 chars via
 * `adminRejectSchema` — this is a UX nicety, not the validation boundary).
 */
export async function submitRejectApplication(input: SubmitRejectInput): Promise<ReviewActionResult> {
  const reason = input.reason.trim()
  if (reason.length === 0) {
    return { ok: false, error: { code: 'missing_reason', message: 'missing_reason' } }
  }
  try {
    await input.post({ reason })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: classifyFailure(err) }
  }
}

/**
 * Mirrors `executeApprove`'s real guard (`commands/review.ts`): approval is
 * only possible from `under_review`. Used to hide/disable the Approve
 * action client-side — defense-in-depth UX, never the authorization
 * boundary (the server re-checks this unconditionally).
 */
export function canApproveFromStatus(kycStatus: string): boolean {
  return kycStatus === 'under_review'
}

/**
 * Mirrors `executeReject`'s real guard: rejection is possible from
 * `pending_verification` OR `under_review`, but never from `approved` or
 * an already-`rejected` application.
 */
export function canRejectFromStatus(kycStatus: string): boolean {
  return kycStatus === 'pending_verification' || kycStatus === 'under_review'
}
