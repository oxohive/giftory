import { NextResponse, type NextRequest } from 'next/server'
import { isAllowed, NO_REFRESH } from '@/lib/http/allowlist'
import { buildLoginForm } from '@/lib/http/login'
import { isAuthAllowed, AUTH_NO_REFRESH, AUTH_FORM_ENCODED_PATHS } from '@/lib/auth/allowlist'
import { buildResetRequestForm, buildResetValidateForm, buildResetConfirmForm } from '@/lib/auth/reset-form'
import { isTrustedOrigin } from '@/lib/auth/csrf'

/**
 * BFF proxy: browser -> dealer-portal (/api/om/*) -> apps/mercato (/api/*).
 *
 * Why: the shared core-auth session uses httpOnly cookies (`auth_token`, `session_token`) set
 * on the backend origin. Proxying keeps them first-party on the dealer-portal origin and avoids
 * CORS entirely (the backend ships no CORS support). Only an explicit allowlist of
 * dealer-facing + shared-auth routes is reachable (src/lib/http/allowlist.ts, extended by
 * src/lib/auth/allowlist.ts for the installed password-reset/invite-setup flow — see P2-UI-04) —
 * admin routes are never proxied here; admin screens live in apps/mercato directly.
 *
 * Two real differences from the shared core-auth contract (verified against
 * @open-mercato/core's auth module source, not the module's own stale AGENTS.md note):
 * - `POST /api/auth/login` takes `application/x-www-form-urlencoded`, not JSON.
 * - `POST /api/auth/session/refresh` takes `{refreshToken}` in a JSON body, not the session
 *   cookie — and `POST /api/auth/logout` redirects (302) rather than returning JSON.
 * This route normalizes all three so every dealer-portal call can go through the same JSON
 * client (@gift/api-client's `request()`), including login/logout. P2-UI-04 additionally
 * normalizes the installed password-reset routes (`auth/reset`, `auth/reset/validate`,
 * `auth/reset/confirm`), which share the same form-encoded-only quirk as login.
 *
 * CSRF (P2-UI-04): every mutating method is rejected with 403 if it carries an `Origin` header
 * that doesn't match this app's own origin — see src/lib/auth/csrf.ts for why this was chosen
 * over a double-submit token (zero client-side integration cost for every feature task that
 * adds a mutating call on top of this proxy).
 */

export const dynamic = 'force-dynamic'

const AUTH_COOKIE = 'auth_token'
const SESSION_COOKIE = 'session_token'
const FORWARDED_REQUEST_HEADERS = ['accept', 'accept-language', 'content-type', 'idempotency-key', 'user-agent']
const UPSTREAM_TIMEOUT_MS = 20_000

function apiBaseUrl(): string {
  return (process.env.OM_API_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
}

function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || null
  return req.headers.get('x-real-ip')
}

/**
 * `req.nextUrl.origin` is NOT this app's origin as the browser/a proxy in front of it sees it —
 * verified directly against a running dev server: with `Host: 127.0.0.1:3201`, `nextUrl.origin`
 * still reported `http://localhost:3201` (Next's own internally-resolved canonical URL, decoupled
 * from the actual `Host` header). Comparing an incoming `Origin` header against `nextUrl.origin`
 * would reject legitimate same-origin requests any time the externally-visible host differs from
 * Next's internal one — always true behind this app's production ALB. Mirrors the backend's own
 * `resolveRequestOrigin` (@open-mercato/shared's `lib/url.ts`) instead: derive the origin from
 * the request's own forwarded/host headers, never from `nextUrl`.
 */
function selfOrigin(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '')
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host
  return `${proto}://${host}`
}

function cookieHeader(values: Record<string, string | undefined>): string | null {
  const parts = Object.entries(values)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
  return parts.length ? parts.join('; ') : null
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

/** The access token lives 8h, the refresh token up to 30d: refresh transparently when only the refresh token is left. */
async function refreshSession(sessionToken: string): Promise<string[]> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/auth/session/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ refreshToken: sessionToken }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []
    return res.headers.getSetCookie()
  } catch {
    return []
  }
}

async function buildBody(req: NextRequest, path: string, sessionToken: string | undefined): Promise<string | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined
  // The client never sees session_token (httpOnly); the proxy supplies it from the cookie jar.
  if (path === 'auth/session/refresh') return JSON.stringify({ refreshToken: sessionToken ?? '' })
  const raw = await req.text()
  if (path === 'auth/login') {
    try {
      const json = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
      return buildLoginForm({
        email: typeof json.email === 'string' ? json.email : '',
        password: typeof json.password === 'string' ? json.password : '',
        remember: Boolean(json.remember),
        tenantId: typeof json.tenantId === 'string' ? json.tenantId : undefined,
      })
    } catch {
      return raw || undefined
    }
  }
  if (AUTH_FORM_ENCODED_PATHS.has(path)) {
    try {
      const json = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
      if (path === 'auth/reset') {
        return buildResetRequestForm({ email: typeof json.email === 'string' ? json.email : '' })
      }
      if (path === 'auth/reset/validate') {
        return buildResetValidateForm({ token: typeof json.token === 'string' ? json.token : '' })
      }
      // auth/reset/confirm
      return buildResetConfirmForm({
        token: typeof json.token === 'string' ? json.token : '',
        password: typeof json.password === 'string' ? json.password : '',
      })
    } catch {
      return raw || undefined
    }
  }
  return raw || undefined
}

function contentTypeFor(path: string, original: string | null): string | null {
  if (path === 'auth/login') return 'application/x-www-form-urlencoded'
  if (path === 'auth/session/refresh') return 'application/json'
  if (AUTH_FORM_ENCODED_PATHS.has(path)) return 'application/x-www-form-urlencoded'
  return original
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await ctx.params
  const path = segments.map((s) => s.trim()).filter(Boolean).join('/')
  if (!isAllowed(path, req.method) && !isAuthAllowed(path, req.method)) {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (!isTrustedOrigin(req.headers.get('origin'), selfOrigin(req))) {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
    }
  }

  const headers = new Headers()
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers.get(name)
    if (value) headers.set(name, value)
  }
  const ip = clientIp(req)
  if (ip) headers.set('x-forwarded-for', ip)

  let authToken = req.cookies.get(AUTH_COOKIE)?.value
  const sessionToken = req.cookies.get(SESSION_COOKIE)?.value
  let refreshedCookies: string[] = []
  if (!authToken && sessionToken && !NO_REFRESH.has(path) && !AUTH_NO_REFRESH.has(path)) {
    refreshedCookies = await refreshSession(sessionToken)
    authToken = readSetCookieValue(refreshedCookies, AUTH_COOKIE) ?? undefined
  }
  const cookies = cookieHeader({ [AUTH_COOKIE]: authToken, [SESSION_COOKIE]: sessionToken })
  if (cookies) headers.set('cookie', cookies)

  const body = await buildBody(req, path, sessionToken)
  const contentType = contentTypeFor(path, headers.get('content-type'))
  if (contentType) headers.set('content-type', contentType)
  else headers.delete('content-type')

  const target = `${apiBaseUrl()}/api/${path}${req.nextUrl.search}`
  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch {
    return NextResponse.json({ error: 'The backend is unreachable. Please try again shortly.' }, { status: 502 })
  }

  const setCookies = [...refreshedCookies, ...upstream.headers.getSetCookie()]

  // The backend's logout redirects (302 to /login) instead of returning JSON; normalize so
  // every dealer-portal call can assume a JSON body.
  if (path === 'auth/logout' && upstream.status >= 300 && upstream.status < 400) {
    const responseHeaders = new Headers({ 'cache-control': 'no-store' })
    for (const cookie of setCookies) responseHeaders.append('set-cookie', cookie)
    return NextResponse.json({ ok: true }, { status: 200, headers: responseHeaders })
  }

  const responseHeaders = new Headers()
  const upstreamContentType = upstream.headers.get('content-type')
  if (upstreamContentType) responseHeaders.set('content-type', upstreamContentType)
  const retryAfter = upstream.headers.get('retry-after')
  if (retryAfter) responseHeaders.set('retry-after', retryAfter)
  responseHeaders.set('cache-control', 'no-store')
  for (const cookie of setCookies) responseHeaders.append('set-cookie', cookie)

  return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const DELETE = proxy
