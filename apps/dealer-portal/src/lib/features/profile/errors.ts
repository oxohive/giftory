/**
 * Plain (non-React) error classifier for the capabilities-save mutation, mirroring the admin
 * dealer-directory capability editor's own classifier
 * (`apps/mercato/.../dealer_org_rbac/components/capabilitiesErrors.ts`) adapted to this app's
 * `@gift/api-client`'s `ApiError` (which already carries `.status`/`.code`/`.details` — see
 * `packages/api-client/src/index.ts`).
 *
 * Real status/code combinations `PUT .../dealer/profile/capabilities` can actually produce (per
 * `commands/capabilities.ts` and `data/validators.ts`, read directly, not guessed):
 *   - 409 `conflict(...)` — a concurrent save changed `updatedAt` since this form last fetched it.
 *   - 422 — `capabilitiesUpsertSchema` rejected the body (unknown key, since it is `.strict()`;
 *     or a value outside the real enum/range).
 *   - 403 — the caller lacks `dealer_org.manage_capabilities` (a `dealer:staff` session, or an
 *     owner session that raced a mid-session deactivation).
 *   - 400 — `badRequest(...)`: "dealer must be approved", the one `findOwnProfile` guard this
 *     command path can hit (kycStatus changed between page load and save — e.g. account was
 *     un-approved, which is not a real lifecycle transition today but is defended anyway).
 *   - 404 — no approved profile at all for the caller's org (`findOwnProfile` throws `notFound`).
 *   - 0 — network failure (the proxy could not reach the backend).
 *
 * Kept outside React so each of these is unit-testable (tests/profile-errors.test.mjs) without
 * mounting any component.
 */
import { ApiError } from '@gift/api-client'
import type { ValidationDetail } from '@gift/api-client'

export type CapabilitiesSaveErrorKind = 'conflict' | 'validation' | 'forbidden' | 'not_found' | 'network' | 'generic'

export interface CapabilitiesSaveError {
  kind: CapabilitiesSaveErrorKind
  message: string
  details?: ValidationDetail[]
}

export function mapCapabilitiesSaveError(err: unknown, fallbackMessage: string): CapabilitiesSaveError {
  if (!(err instanceof ApiError)) {
    return { kind: 'generic', message: fallbackMessage }
  }

  if (err.isNetworkError) return { kind: 'network', message: err.message }
  if (err.status === 409) return { kind: 'conflict', message: err.message }
  if (err.isValidation) return { kind: 'validation', message: err.message, details: err.details }
  if (err.isForbidden) return { kind: 'forbidden', message: err.message }
  if (err.status === 404) return { kind: 'not_found', message: err.message }
  return { kind: 'generic', message: err.message || fallbackMessage }
}
