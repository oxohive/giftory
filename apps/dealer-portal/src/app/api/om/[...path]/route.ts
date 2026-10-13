import { NextResponse, type NextRequest } from 'next/server'
import { isAllowed, NO_REFRESH } from '@/lib/http/allowlist'
import { buildLoginForm } from '@/lib/http/login'

/**
 * BFF proxy: browser -> dealer-portal (/api/om/*) -> apps/mercato (/api/*).
 *
 * Why: the shared core-auth session uses httpOnly cookies (`auth_token`, `session_token`) set
 * on the backend origin. Proxying keeps them first-party on the dealer-portal origin and avoids
 * CORS entirely (the backend ships no CORS support). Only an explicit allowlist of
 * dealer-facing + shared-auth routes is reachable (src/lib/http/allowlist.ts) — admin routes
 * are never proxied here; admin screens live in apps/mercato directly.
 *
 * Two real differences from the shared core-auth contract (verified against
 * @open-mercato/core's auth module source, not the module's own stale AGENTS.md note):
 * - `POST /api/auth/login` takes `application/x-www-form-urlencoded`, not JSON.
 * - `POST /api/auth/session/refresh` takes `{refreshToken}` in a JSON body, not the session
 *   cookie — and `POST /api/auth/logout` redirects (302) rather than returning JSON.
 * This route normalizes all three so every dealer-portal call can go through the same JSON
 * client (@gift/api-client's `request()`), including login/logout.
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
  return raw || undefined
}

function contentTypeFor(path: string, original: string | null): string | null {
  if (path === 'auth/login') return 'application/x-www-form-urlencoded'
  if (path === 'auth/session/refresh') return 'application/json'
  return original
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await ctx.params
  const path = segments.map((s) => s.trim()).filter(Boolean).join('/')
  if (!isAllowed(path, req.method)) {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
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
  if (!authToken && sessionToken && !NO_REFRESH.has(path)) {
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
