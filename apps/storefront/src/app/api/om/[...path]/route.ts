import { NextResponse, type NextRequest } from 'next/server'
import { serverEnv } from '@/lib/env.server'

/**
 * BFF proxy: browser -> storefront (/api/om/*) -> Open Mercato (/api/*).
 *
 * Why: Open Mercato ships no CORS handling, and its customer auth uses httpOnly cookies
 * (`customer_auth_token`, `customer_session_token`) set on the backend origin. Proxying keeps
 * the cookies first-party on the storefront origin, avoids CORS entirely, and lets us inject the
 * storefront's tenant/organization into login/signup (required on platform domains, see
 * customer_accounts/lib/resolveTenantContext.js).
 *
 * Security: only an explicit allowlist of customer-facing/public routes is reachable. Staff
 * routes are never proxied and no staff credentials are ever attached here.
 */

export const dynamic = 'force-dynamic'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

const ALLOWED: { pattern: RegExp; methods: Method[] }[] = [
  { pattern: /^customer_accounts\/(login|signup)$/, methods: ['POST'] },
  { pattern: /^customer_accounts\/email\/verify$/, methods: ['POST'] },
  { pattern: /^customer_accounts\/password\/(reset-request|reset-confirm)$/, methods: ['POST'] },
  { pattern: /^customer_accounts\/magic-link\/(request|verify)$/, methods: ['POST'] },
  { pattern: /^customer_accounts\/portal\/profile$/, methods: ['GET', 'PUT'] },
  { pattern: /^customer_accounts\/portal\/(logout|password-change|sessions-refresh)$/, methods: ['POST'] },
  { pattern: /^warranty_claims\/portal\/orders(\/lines)?$/, methods: ['GET'] },
  // Gift catalog public endpoints (module in progress, see src/lib/api/gift-catalog.ts).
  { pattern: /^gift_catalog\/[A-Za-z0-9_\-/]+$/, methods: ['GET'] },
  // Razorpay signature confirmation (gateway_razorpay/api/confirm, see src/lib/api/payments.ts).
  { pattern: /^gateway_razorpay\/confirm$/, methods: ['POST'] },
  // Backend `storefront` module: public catalog, cart, checkout, orders, address book (G1–G6, G8).
  { pattern: /^storefront\/[A-Za-z0-9_\-/]+$/, methods: ['GET', 'POST', 'PUT', 'DELETE'] },
]

/** Routes that resolve the shop from `organizationId`/`orgSlug` on platform domains. */
const SHOP_QUERY_PREFIXES = ['storefront/', 'gift_catalog/']

const AUTH_COOKIE = 'customer_auth_token'
const SESSION_COOKIE = 'customer_session_token'
/** Backend `storefront` module cookies: anonymous cart token and guest order access (both httpOnly). */
const CART_COOKIE = 'sf_cart_token'
const ORDER_ACCESS_COOKIE = 'sf_order_access'

/** Routes whose body takes tenant/organization ids (customer_accounts/data/validators.js). */
const TENANT_BODY_ROUTES: Record<string, { org: boolean; tenant: boolean }> = {
  'customer_accounts/login': { org: true, tenant: true },
  'customer_accounts/signup': { org: true, tenant: true },
  'customer_accounts/password/reset-request': { org: false, tenant: true },
  'customer_accounts/magic-link/request': { org: false, tenant: true },
}

const NO_REFRESH = new Set([
  'customer_accounts/login',
  'customer_accounts/signup',
  'customer_accounts/portal/logout',
  'customer_accounts/portal/sessions-refresh',
])

const FORWARDED_REQUEST_HEADERS = ['accept', 'accept-language', 'content-type', 'idempotency-key', 'user-agent']

// Order placement and payment calls do many DB round trips (and call the payment provider).
// Aborting them early makes the shopper see a failure for an order that was actually created.
const SLOW_PATHS = [/^storefront\/checkout\/orders$/, /^storefront\/orders\/[^/]+\/payment-session$/, /^gateway_razorpay\/confirm$/]
const DEFAULT_UPSTREAM_TIMEOUT_MS = 20_000
const SLOW_UPSTREAM_TIMEOUT_MS = 120_000

function upstreamTimeoutMs(path: string): number {
  return SLOW_PATHS.some((pattern) => pattern.test(path)) ? SLOW_UPSTREAM_TIMEOUT_MS : DEFAULT_UPSTREAM_TIMEOUT_MS
}

function isAllowed(path: string, method: string): boolean {
  if (path.includes('..') || path.includes('//')) return false
  return ALLOWED.some((rule) => rule.pattern.test(path) && rule.methods.includes(method as Method))
}

function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || null
  return req.headers.get('x-real-ip')
}

async function buildBody(req: NextRequest, path: string): Promise<string | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined
  const raw = await req.text()
  const inject = TENANT_BODY_ROUTES[path]
  if (!inject) return raw || undefined
  let json: Record<string, unknown> = {}
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) json = parsed as Record<string, unknown>
  } catch {
    return raw
  }
  // Server config wins: shoppers must not pick another tenant/organization.
  if (inject.org && serverEnv.organizationId) json.organizationId = serverEnv.organizationId
  if (inject.tenant && serverEnv.tenantId) json.tenantId = serverEnv.tenantId
  return JSON.stringify(json)
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

/** The JWT lives 8h, the session token 30d: refresh transparently when only the session is left. */
async function refreshSession(sessionToken: string, baseHeaders: Headers): Promise<string[]> {
  try {
    const headers = new Headers(baseHeaders)
    headers.set('cookie', `${SESSION_COOKIE}=${encodeURIComponent(sessionToken)}`)
    headers.set('content-type', 'application/json')
    const res = await fetch(`${serverEnv.apiBaseUrl}/api/customer_accounts/portal/sessions-refresh`, {
      method: 'POST',
      headers,
      body: '{}',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []
    return res.headers.getSetCookie()
  } catch {
    return []
  }
}

/**
 * Server config wins: the shop identifier is always set (or overwritten) from env, so shoppers
 * cannot point the facade at another organization. The backend derives the tenant from it.
 */
function buildSearch(req: NextRequest, path: string): string {
  if (!SHOP_QUERY_PREFIXES.some((prefix) => path.startsWith(prefix))) return req.nextUrl.search
  const params = new URLSearchParams(req.nextUrl.search)
  params.delete('tenantId')
  if (serverEnv.organizationId) {
    params.set('organizationId', serverEnv.organizationId)
    params.delete('orgSlug')
  } else if (serverEnv.organizationSlug) {
    params.set('orgSlug', serverEnv.organizationSlug)
    params.delete('organizationId')
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await ctx.params
  const path = segments.map((s) => s.trim()).filter(Boolean).join('/')
  if (!isAllowed(path, req.method)) {
    return NextResponse.json({ ok: false, error: 'Not available' }, { status: 404 })
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
    refreshedCookies = await refreshSession(sessionToken, headers)
    authToken = readSetCookieValue(refreshedCookies, AUTH_COOKIE) ?? undefined
  }
  const cookies = cookieHeader({
    [AUTH_COOKIE]: authToken,
    [SESSION_COOKIE]: sessionToken,
    [CART_COOKIE]: req.cookies.get(CART_COOKIE)?.value,
    [ORDER_ACCESS_COOKIE]: req.cookies.get(ORDER_ACCESS_COOKIE)?.value,
  })
  if (cookies) headers.set('cookie', cookies)

  const target = `${serverEnv.apiBaseUrl}/api/${path}${buildSearch(req, path)}`
  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: await buildBody(req, path),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(upstreamTimeoutMs(path)),
    })
  } catch {
    return NextResponse.json(
      { ok: false, error: 'The store backend is unreachable. Please try again shortly.' },
      { status: 502 },
    )
  }

  const responseHeaders = new Headers()
  const contentType = upstream.headers.get('content-type')
  if (contentType) responseHeaders.set('content-type', contentType)
  const retryAfter = upstream.headers.get('retry-after')
  if (retryAfter) responseHeaders.set('retry-after', retryAfter)
  responseHeaders.set('cache-control', 'no-store')
  // Relay auth cookies. Backend cookies carry no Domain attribute, so they bind to the storefront host.
  for (const cookie of [...refreshedCookies, ...upstream.headers.getSetCookie()]) {
    responseHeaders.append('set-cookie', cookie)
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const DELETE = proxy
