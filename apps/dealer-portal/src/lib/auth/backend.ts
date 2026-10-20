/**
 * Server-to-backend calls used to resolve dealer access for route gating (session.ts/guard.ts).
 * Deliberately separate from the BFF proxy (src/app/api/om/[...path]/route.ts): that route runs
 * as a Route Handler and can set cookies on its response; these calls run from Server Components
 * (pages/layouts) during render, where Next's `cookies()` cannot be written to (see Next's docs
 * on `cookies()` — "Setting cookies is not supported during Server Component rendering"). So
 * this file talks to `OM_API_BASE_URL` directly, duplicating the proxy's small
 * cookie-forwarding/refresh pattern read-only, rather than importing/reusing the proxy route.
 *
 * No `import 'server-only'` here on purpose: unlike session.ts (which reads `next/headers` and
 * must never run client-side), this module has no Next-specific API surface — only `fetch` and
 * `process.env` — so it stays importable from a plain `node --test` run against a local HTTP
 * server, which is how tests/backend.test.mjs exercises it against real response shapes instead
 * of mocking this module itself. It is still only ever called from server-only callers
 * (session.ts, the (auth)/reset/[token] server page) in actual application code.
 */
const UPSTREAM_TIMEOUT_MS = 8_000

function apiBaseUrl(): string {
  return (process.env.OM_API_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
}

function readSetCookieValue(setCookies: string[], name: string): string | null {
  for (const header of setCookies) {
    const [pair] = header.split(';')
    if (!pair) continue
    const index = pair.indexOf('=')
    if (index > 0 && pair.slice(0, index).trim() === name) {
      const value = pair.slice(index + 1).trim()
      try {
        return decodeURIComponent(value)
      } catch {
        return value
      }
    }
  }
  return null
}

/** Exchanges the long-lived `session_token` for a fresh `auth_token`, read-only: the result is
 *  used only to decide access during this render and is never written back as a cookie (see the
 *  file-level note above). The browser's own next call through the BFF proxy performs its own
 *  refresh and persists the cookie normally — this duplicated refresh is the accepted cost of
 *  deciding access from a Server Component. */
export async function refreshAuthToken(sessionToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/auth/session/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ refreshToken: sessionToken }),
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    if (!res.ok) return null
    return readSetCookieValue(res.headers.getSetCookie(), 'auth_token')
  } catch {
    return null
  }
}

export interface AuthProfileOutcome {
  ok: boolean
  roles: string[]
  email?: string
  name?: string | null
}

export async function fetchAuthProfile(authToken: string): Promise<AuthProfileOutcome> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/auth/profile`, {
      headers: { cookie: `auth_token=${encodeURIComponent(authToken)}`, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    if (!res.ok) return { ok: false, roles: [] }
    const body = (await res.json().catch(() => null)) as { roles?: unknown; email?: unknown; name?: unknown } | null
    const roles = Array.isArray(body?.roles) ? body.roles.filter((r): r is string => typeof r === 'string') : []
    return {
      ok: true,
      roles,
      email: typeof body?.email === 'string' ? body.email : undefined,
      name: typeof body?.name === 'string' ? body.name : null,
    }
  } catch {
    return { ok: false, roles: [] }
  }
}

export interface OnboardingStatusOutcome {
  status: 'ok' | 'not_found' | 'forbidden' | 'unauthorized' | 'error'
  kycStatus?: string
  rejectionReason?: string | null
}

export async function fetchOnboardingStatus(authToken: string): Promise<OnboardingStatusOutcome> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/dealer_onboarding/dealer/onboarding/status`, {
      headers: { cookie: `auth_token=${encodeURIComponent(authToken)}`, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    if (res.status === 401) return { status: 'unauthorized' }
    if (res.status === 403) return { status: 'forbidden' }
    if (res.status === 404) return { status: 'not_found' }
    if (!res.ok) return { status: 'error' }
    const body = (await res.json().catch(() => null)) as { kycStatus?: unknown; rejectionReason?: unknown } | null
    return {
      status: 'ok',
      kycStatus: typeof body?.kycStatus === 'string' ? body.kycStatus : undefined,
      rejectionReason: typeof body?.rejectionReason === 'string' ? body.rejectionReason : null,
    }
  } catch {
    return { status: 'error' }
  }
}

/** Used by the (auth)/reset/[token] page to decide whether to render the set-password form or a
 *  "this link is no longer valid" terminal state, before the user types anything — mirrors the
 *  backend's own token-state response: it never distinguishes unknown/used/expired tokens, so
 *  neither does this. */
export async function validateResetToken(token: string): Promise<boolean> {
  try {
    // Same form-encoded-only quirk as the proxy's reset routes (see reset-form.ts) — built
    // inline rather than importing that module, since a relative import between two of this
    // app's own .ts files needs an explicit extension for plain `node --test` to resolve it, and
    // this tsconfig (intentionally, per the rest of the app) does not enable
    // `allowImportingTsExtensions` to permit that. One line of duplication beats a special case.
    const requestBody = new URLSearchParams({ token }).toString()
    const res = await fetch(`${apiBaseUrl()}/api/auth/reset/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: requestBody,
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    if (!res.ok) return false
    const responseBody = (await res.json().catch(() => null)) as { valid?: unknown } | null
    return responseBody?.valid === true
  } catch {
    return false
  }
}
