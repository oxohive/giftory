/**
 * Server-side transport for the two dedicated onboarding document routes
 * (`app/(onboarding)/api/onboarding/documents/route.ts` and `.../[id]/file/route.ts`). Every
 * function here takes plain values (strings, `FormData`, `Headers`) rather than `NextRequest`/
 * `NextResponse` on purpose: those route.ts files stay thin Next-specific wrappers, and this
 * module — the part that actually matters for correctness — runs under plain `node --test`
 * against a real local HTTP server standing in for apps/mercato (see
 * tests/onboarding-document-transport.test.mjs), the same "pure logic separated from the Next
 * runtime" split this app already uses for access.ts/guard.ts and backend.ts/session.ts.
 *
 * Why these don't go through the existing BFF proxy (`src/app/api/om/[...path]/route.ts`,
 * outside this task's owned paths):
 *
 * 1. That proxy's `buildBody()` reads every non-special-cased request body with `req.text()`
 *    and forwards the resulting STRING to `fetch()`. `Request#text()` decodes the body as
 *    UTF-8; a `multipart/form-data` body carrying real binary bytes (a JPEG/PNG/PDF/TIFF KYC
 *    document) is not valid UTF-8 in general, so the decode is LOSSY — invalid byte sequences
 *    become U+FFFD replacement characters and the re-encoded bytes sent upstream no longer
 *    match the original file. Verified directly (not assumed) before building this: a 17-byte
 *    JPEG-header buffer round-tripped through `new Request(...).text()` and back came out with
 *    10 of its 17 bytes corrupted. This task's acceptance bar ("a failed upload never produces
 *    a false success state") rules out a transport that silently corrupts bytes while still
 *    returning 201 — binary multipart must never go through that body-forwarding path.
 * 2. The file-download route (`GET .../documents/{id}/file`) isn't on the existing proxy's
 *    allowlist (`@/lib/http/allowlist.ts`) at all — only the upload POST is. Both allowlist.ts
 *    and the proxy route itself are outside this task's owned paths (P2-UI-04/lane A territory
 *    — `src/app/api/om/`, `src/lib/http/`), so neither can be edited from here.
 *
 * These two routes duplicate the proxy's small cookie/refresh/CSRF pattern rather than
 * importing it (there is nothing importable to reuse — the logic lives inline in the proxy's
 * route handler, and the pattern of "duplicate this small plumbing per caller instead of
 * reaching into another lane's route file" is the one already established by
 * `@/lib/auth/backend.ts` and `@/lib/auth/session.ts` for the identical reason, per their own
 * doc comments). The CSRF same-origin check is reproduced inline (see `checkCsrf` below) rather
 * than imported from `@/lib/auth/csrf`, for the same testability reason as the point above.
 *
 * No `import 'server-only'` here, on purpose, mirroring `@/lib/auth/backend.ts`'s own stated
 * rationale verbatim: this module's only API surface is `fetch`/`Headers`/`FormData`/
 * `process.env` — nothing Next-specific — so it stays importable from a plain `node --test` run
 * (the `server-only` package throws unconditionally outside Next's bundler substitution, which
 * is exactly why `session.ts`/`guard.ts`, which DO need it, are kept too thin to unit-test
 * directly). It is still only ever called from genuine server code in production (the two
 * route.ts files above), never from a Client Component.
 */

const AUTH_COOKIE = 'auth_token'
const UPSTREAM_TIMEOUT_MS = 20_000

export function apiBaseUrl(): string {
  return (process.env.OM_API_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
}

/** Mirrors the main proxy's own `selfOrigin()` — see that file's doc comment for why a bare
 *  `nextUrl.origin` is not usable (it never reflects the real Host/forwarded headers). Takes
 *  the already-extracted header values and URL parts so it needs no Next-specific type. */
export function selfOrigin(
  headers: { get(name: string): string | null },
  fallbackProtocol: string,
  fallbackHost: string,
): string {
  const proto = headers.get('x-forwarded-proto') || fallbackProtocol
  const host = headers.get('x-forwarded-host') || headers.get('host') || fallbackHost
  return `${proto}://${host}`
}

/**
 * GET/HEAD never need the check (no session-changing side effect); every mutating method must
 * carry a same-origin (or absent) `Origin` header. Deliberately NOT importing
 * `@/lib/auth/csrf`'s `isTrustedOrigin` (which this mirrors exactly, logic-for-logic) — doing so
 * would pull a `@/`-aliased value-import into this file, and that alias only resolves through
 * Next's bundler, not under the plain `node --test` run this module is specifically written to
 * support (see the module doc comment). Browsers omit `Origin` on some same-origin requests, so
 * absence is treated as same-origin rather than rejected, same as the file this mirrors.
 */
export function checkCsrf(method: string, originHeader: string | null, origin: string): boolean {
  if (method === 'GET' || method === 'HEAD') return true
  if (!originHeader) return true
  return originHeader === origin
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

export interface ResolvedAuth {
  /** Usable `auth_token` for the upstream call, or null if none could be resolved. */
  authToken: string | null
  /** Set when a transparent refresh minted a new auth_token — forward onto the response so the
   *  browser's cookie jar stays current (Route Handlers, unlike Server Components, CAN set
   *  cookies on their response). */
  refreshedSetCookie: string | null
}

/** The access token lives 8h, the refresh token up to 30d — refresh transparently when only the
 *  refresh token is left, exactly like the main proxy's own `refreshSession()`. */
export async function resolveAuth(cookies: { authToken?: string; sessionToken?: string }): Promise<ResolvedAuth> {
  if (cookies.authToken) return { authToken: cookies.authToken, refreshedSetCookie: null }
  if (!cookies.sessionToken) return { authToken: null, refreshedSetCookie: null }

  try {
    const res = await fetch(`${apiBaseUrl()}/api/auth/session/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ refreshToken: cookies.sessionToken }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return { authToken: null, refreshedSetCookie: null }
    const setCookies = res.headers.getSetCookie()
    const refreshed = readSetCookieValue(setCookies, AUTH_COOKIE)
    const setCookieHeader = setCookies.find((c) => c.trim().toLowerCase().startsWith(`${AUTH_COOKIE}=`)) ?? null
    return { authToken: refreshed, refreshedSetCookie: setCookieHeader }
  } catch {
    return { authToken: null, refreshedSetCookie: null }
  }
}

export function cookieHeaderFor(authToken: string | null): string | null {
  if (!authToken) return null
  return `${AUTH_COOKIE}=${encodeURIComponent(authToken)}`
}

export interface ForwardUploadResult {
  status: number
  bodyText: string
  retryAfter: string | null
}

/**
 * Forwards an ALREADY-PARSED `FormData` (as `req.formData()` would produce from the incoming
 * multipart body) straight to the real upload endpoint. Handing the browser's own `File`/
 * `FormData` objects to `fetch` lets `fetch` re-encode the multipart body itself from the
 * underlying bytes — verified directly (see tests/onboarding-document-transport.test.mjs) that
 * this round-trips binary content exactly, unlike a text-based forward.
 */
export async function forwardUpload(params: {
  authToken: string
  form: FormData
  forwardedFor?: string | null
}): Promise<ForwardUploadResult> {
  const headers = new Headers({ accept: 'application/json', cookie: cookieHeaderFor(params.authToken) ?? '' })
  if (params.forwardedFor) headers.set('x-forwarded-for', params.forwardedFor)

  const upstream = await fetch(`${apiBaseUrl()}/api/dealer_onboarding/dealer/onboarding/documents`, {
    method: 'POST',
    headers,
    body: params.form,
    cache: 'no-store',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  })
  const bodyText = await upstream.text()
  return { status: upstream.status, bodyText, retryAfter: upstream.headers.get('retry-after') }
}

/**
 * Forwards a KYC document download. Returns the raw upstream `Response` so the caller (the
 * route.ts wrapper) can stream `.body` straight into a `NextResponse` without ever buffering
 * through `.text()` — a GET has no request-body corruption risk, but the RESPONSE must stay a
 * byte-for-byte stream too (a scanned KYC document can be large; buffering also risks the same
 * kind of lossy re-encoding if a caller mistakenly ran it through `.text()`).
 */
export async function forwardDownload(params: {
  authToken: string
  documentId: string
  download: boolean
}): Promise<Response> {
  const headers = new Headers({ accept: 'application/octet-stream, application/json', cookie: cookieHeaderFor(params.authToken) ?? '' })
  const search = params.download ? '?download=1' : ''
  const target = `${apiBaseUrl()}/api/dealer_onboarding/dealer/onboarding/documents/${encodeURIComponent(params.documentId)}/file${search}`
  return fetch(target, {
    method: 'GET',
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  })
}
