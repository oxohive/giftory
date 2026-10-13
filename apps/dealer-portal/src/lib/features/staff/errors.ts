/**
 * Plain (non-React) error classifiers for the staff invite/deactivate mutations, mirroring
 * `lib/features/profile/errors.ts`'s `mapCapabilitiesSaveError` split, adapted to the real
 * status/code combinations `POST .../dealer/staff/invite` and
 * `POST .../dealer/staff/{id}/deactivate` can actually produce — read directly from
 * `apps/mercato/src/modules/dealer_org_rbac/commands/staff.ts` and the shared
 * `dealer_onboarding/lib/http.ts` wrapper both routes go through (`dealerHandler`), not guessed:
 *
 * Invite (`executeStaffInvite`):
 *   - 422 `invalid_request` — `staffInviteSchema` rejected the body (email malformed, name empty
 *     string after trim since the schema's `name` is `.min(1)` when present, or an unknown
 *     `.strict()` key).
 *   - 400 — duplicate email: `auth.users.create`'s `throwDuplicateEmailError()` throws a
 *     `CrudHttpError(400, { error: 'Email already in use', fieldErrors, details })`, but
 *     `dealerHandler`'s `isCrudHttpError` branch only forwards `status`/`code`/`message` — it
 *     does NOT forward `fieldErrors`/`details` (verified by reading `dealer_onboarding/lib/
 *     http.ts`'s `dealerHandler` — only the ZodError branch builds an `extra` with `details`).
 *     So the real wire shape for this case is `{ error: 'Email already in use', code:
 *     'request_failed' }` with no `details[]` at all — detected here by status 400 + the
 *     server's own real message text, not by a `code`/`details` field that does not exist on
 *     the wire for this path.
 *   - 400 — "dealer must be approved" (`findOwnProfile`'s own guard) — same status, different
 *     real message; falls through to `generic` below, which still shows the real server message.
 *   - 403 — caller lacks `dealer_org.manage_staff` (a `dealer:staff` session, or an owner session
 *     that raced a mid-session deactivation).
 *   - 404 — no approved profile at all for the caller's org (`findOwnProfile` throws `notFound`).
 *   - 0 — network failure.
 *
 * Deactivate (`executeStaffDeactivate`):
 *   - 400 — "An owner cannot deactivate their own account" (self-deactivation guard). Unreachable
 *     through this app's own UI (the Deactivate action is never rendered on an owner row — see
 *     `roster.ts`'s `canDeactivate`), but defended here anyway for a direct API call.
 *   - 404 — "Staff user not found" (`findDealerStaffUser` fails closed for a different org's
 *     user, a dealer:owner's id, or an unknown id) OR no approved profile for the caller's org.
 *     Both produce the same status; the real message text differs and is shown as-is.
 *   - 403 / 0 — same as invite.
 *
 * Neither route can ever report "the invite email failed to send" to this client: the installed
 * `auth.users.create` command DOES compute that (`warning: 'invite_email_failed'`), but
 * `executeStaffInvite` discards `result.warning` and returns only `{ userId, email }` (verified
 * by reading `commands/staff.ts` directly). So "a failed invitation send" in this app's UI means
 * exactly what the real contract can report: the POST itself failing (network/5xx/4xx) — never a
 * distinct "sent, but the email bounced" state, which the backend does not expose. Flagged as a
 * backend follow-up in this task's handoff, not invented here.
 */
import { ApiError } from '@gift/api-client'
import type { ValidationDetail } from '@gift/api-client'

export type StaffMutationErrorKind =
  | 'duplicate_email'
  | 'validation'
  | 'forbidden'
  | 'not_found'
  | 'unauthorized'
  | 'network'
  | 'generic'

export interface StaffMutationError {
  kind: StaffMutationErrorKind
  message: string
  details?: ValidationDetail[]
}

/** True for the one real duplicate-email message `throwDuplicateEmailError()` sends — matched on
 *  the server's own real text (there is no dedicated `code`/`details` for this case on the wire,
 *  see this file's header comment), case-insensitively since i18n may vary casing. */
function looksLikeDuplicateEmail(status: number, message: string): boolean {
  return status === 400 && /already in use/i.test(message)
}

function classify(err: unknown, fallbackMessage: string): StaffMutationError {
  if (!(err instanceof ApiError)) {
    return { kind: 'generic', message: fallbackMessage }
  }
  if (err.isNetworkError) return { kind: 'network', message: err.message }
  if (err.isUnauthorized) return { kind: 'unauthorized', message: err.message }
  if (err.isForbidden) return { kind: 'forbidden', message: err.message }
  if (err.isValidation) return { kind: 'validation', message: err.message, details: err.details }
  if (looksLikeDuplicateEmail(err.status, err.message)) return { kind: 'duplicate_email', message: err.message }
  if (err.status === 404) return { kind: 'not_found', message: err.message }
  return { kind: 'generic', message: err.message || fallbackMessage }
}

export function mapStaffInviteError(err: unknown, fallbackMessage: string): StaffMutationError {
  return classify(err, fallbackMessage)
}

export function mapStaffDeactivateError(err: unknown, fallbackMessage: string): StaffMutationError {
  return classify(err, fallbackMessage)
}
