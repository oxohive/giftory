/**
 * Base URL for the dealer-facing portal app. Duplicated (not imported) from
 * `dealer_onboarding/lib/url.ts` per this repo's module-isolation
 * convention — small constants/helpers are redeclared per module rather than
 * shared via a cross-module import (see `DEALER_OWNER_ROLE` for the existing
 * precedent). Keep both copies in sync if the env var name ever changes.
 */
export function resolveDealerPortalBaseUrl(): string {
  const configured = process.env.DEALER_PORTAL_BASE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[internal] DEALER_PORTAL_BASE_URL must be configured in production to send dealer portal email links',
    )
  }
  return 'http://localhost:3200'
}
