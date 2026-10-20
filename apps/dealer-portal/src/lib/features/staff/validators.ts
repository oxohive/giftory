/**
 * Pure, DOM/Next/fetch-free logic for the invite-staff form — runs under plain `node --test`
 * (tests/staff-validators.test.mjs) against the real bounds, copied directly from
 * `apps/mercato/src/modules/dealer_org_rbac/data/validators.ts`'s `staffInviteSchema` (read
 * verbatim, not guessed):
 *
 *   staffInviteSchema = z.object({
 *     email: z.string().trim().email().max(255),
 *     name: z.string().trim().min(1).max(255).optional(),
 *   }).strict()
 *
 * The server remains the source of truth — a real 422's `details[]` is folded on top of these
 * client-side errors by `mergeFieldErrors`, the same pattern `lib/features/profile/validators.ts`
 * already established for this app.
 *
 * Deliberately does not import `./types.ts` for its value logic (no need to), and does not import
 * anything outside this file so it stays trivially loadable by Node's plain ESM loader.
 */
const EMAIL_MAX_LENGTH = 255
const NAME_MAX_LENGTH = 255

// A deliberately simple, real-world email shape check — client-side convenience only. The
// backend's `z.string().email()` is the actual authority; this never needs to match it exactly,
// only to catch obvious typos before a round trip, matching this app's existing convention
// (see profile/validators.ts's own client-vs-server split).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface InviteFormValues {
  email: string
  name: string
}

export type FieldErrors = Record<string, string>

export function validateInviteEmail(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Email is required.'
  if (trimmed.length > EMAIL_MAX_LENGTH) return `Email must be at most ${EMAIL_MAX_LENGTH} characters.`
  if (!EMAIL_RE.test(trimmed)) return 'Enter a valid email address.'
  return null
}

/** `name` is optional in the real schema — an empty value is valid (omitted from the payload). */
export function validateInviteName(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > NAME_MAX_LENGTH) return `Name must be at most ${NAME_MAX_LENGTH} characters.`
  return null
}

export function validateInviteForm(values: InviteFormValues): FieldErrors {
  const errors: FieldErrors = {}
  const email = validateInviteEmail(values.email)
  if (email) errors.email = email
  const name = validateInviteName(values.name)
  if (name) errors.name = name
  return errors
}

/**
 * Builds exactly the body `POST .../dealer/staff/invite` expects (`staffInviteSchema` is
 * `.strict()` — any extra key 422s). `name` is included only when non-empty, matching the real
 * schema's `.optional()` (sending `name: ''` would fail the server's own `.min(1)`).
 *
 * Throws if `values` still fails `validateInviteForm` — callers must validate first, mirroring
 * `profile/validators.ts`'s `buildCapabilitiesPayload` discipline of never serializing a
 * provisional invalid value.
 */
export function buildInvitePayload(values: InviteFormValues): Record<string, unknown> {
  const errors = validateInviteForm(values)
  if (Object.keys(errors).length > 0) {
    throw new Error('Cannot build an invite payload from invalid form values.')
  }
  const payload: Record<string, unknown> = { email: values.email.trim() }
  const name = values.name.trim()
  if (name) payload.name = name
  return payload
}

/**
 * Folds the server's real 422 `details[]` (`{path, message}`, per API-CONTRACTS.md's standard
 * response shape) on top of client-side errors — the server is authoritative, so its message for
 * a field always wins over whatever (if anything) client validation already said.
 */
export function mergeFieldErrors(
  clientErrors: FieldErrors,
  serverDetails?: Array<{ path: string | number | (string | number)[]; message: string }>,
): FieldErrors {
  const merged: FieldErrors = { ...clientErrors }
  for (const detail of serverDetails ?? []) {
    const path = Array.isArray(detail.path) ? detail.path.join('.') : String(detail.path)
    if (path) merged[path] = detail.message
  }
  return merged
}
