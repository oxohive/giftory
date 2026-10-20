/**
 * Base URL for the dealer-facing portal app (not yet scaffolded — see
 * TASK-01 / FEAT-010). Deliberately separate from `APP_URL`
 * (`getSecurityEmailBaseUrl()`, used by the core auth module's own
 * invite/reset emails) and from `PLATFORM_PORTAL_BASE_URL` (the Phase 1
 * customer portal) — the dealer portal is its own app on its own origin.
 *
 * Mirrors the lesson already recorded in spec/phase-1 (Gap G7,
 * `PLATFORM_PORTAL_BASE_URL`): a misconfigured base URL in production must
 * fail loudly rather than silently mail a `localhost` link nobody outside
 * the dev machine can open.
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
