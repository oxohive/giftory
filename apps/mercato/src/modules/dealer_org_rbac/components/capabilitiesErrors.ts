/**
 * Plain (non-React) error classifier for the capability save mutation.
 *
 * `readApiResultOrThrow`/`apiCallOrThrow` (`@open-mercato/ui/backend/utils/
 * apiCall`) throw an `Error` with the server's JSON body spread onto it
 * (`raiseCrudError` in `.../utils/serverErrors.ts`), so a thrown error from
 * `PUT /api/dealer_org_rbac/admin/dealers/{id}/capabilities` carries
 * `.status`, `.code`, and — for a 422 — `.details` (`{path, message}[]`),
 * exactly per API-CONTRACTS.md's standard response-shape table and this
 * route's own `capabilitiesUpsertSchema`/`dealerHandler` wiring
 * (`lib/http.ts`'s `parseOrThrow`/`dealerHandler`).
 *
 * Kept outside React so each real status/code combination this route can
 * actually produce is unit-testable without mounting `CapabilitiesForm`.
 */
export type CapabilitiesSaveErrorKind =
  | 'conflict'
  | 'validation'
  | 'forbidden'
  | 'not_approved'
  | 'generic'

export type CapabilitiesSaveError = {
  kind: CapabilitiesSaveErrorKind
  message: string
  details?: Array<{ path: string; message: string }>
}

function readStatus(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | null | undefined)?.status
  return typeof status === 'number' ? status : undefined
}

function readCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null | undefined)?.code
  return typeof code === 'string' ? code : undefined
}

function readDetails(err: unknown): Array<{ path: string; message: string }> | undefined {
  const details = (err as { details?: unknown } | null | undefined)?.details
  if (!Array.isArray(details)) return undefined
  const normalized = details
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const path = typeof (entry as { path?: unknown }).path === 'string' ? (entry as { path: string }).path : ''
      const message = typeof (entry as { message?: unknown }).message === 'string' ? (entry as { message: string }).message : null
      if (!message) return null
      return { path, message }
    })
    .filter((entry): entry is { path: string; message: string } => entry !== null)
  return normalized.length ? normalized : undefined
}

export function mapCapabilitiesSaveError(err: unknown, fallbackMessage: string): CapabilitiesSaveError {
  const message = err instanceof Error && err.message ? err.message : fallbackMessage
  const status = readStatus(err)
  const code = readCode(err)
  const details = readDetails(err)

  // 409: `conflict(...)` in `commands/capabilities.ts` — someone else saved
  // capabilities since this form last fetched them. Never silently retry;
  // the caller must reload before saving again.
  if (status === 409) return { kind: 'conflict', message }

  // 422: `capabilitiesUpsertSchema` rejected the body — either an unknown
  // key (the schema is `.strict()`) or a value outside the real enum/range
  // (e.g. a `printingMethods` entry that isn't one of `PRINTING_METHODS`).
  // `details` carries the exact field(s) and reason(s).
  if (status === 422 || code === 'invalid_request') return { kind: 'validation', message, details }

  // 403: the caller lacks `dealer_org.admin` — surfaced distinctly so the
  // UI can say "you don't have permission to save this" instead of a
  // generic failure (this is the real, server-enforced shape of the
  // employee/read-only scenario — see this module's ACL contract test).
  if (status === 403) return { kind: 'forbidden', message }

  // 400: `badRequest(...)` in the command — most commonly "dealer must be
  // approved" if the dealer's KYC status changed between page load and
  // save.
  if (status === 400) return { kind: 'not_approved', message }

  return { kind: 'generic', message }
}
