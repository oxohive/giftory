import { NextResponse, type NextRequest } from 'next/server'
import { checkCsrf, forwardUpload, resolveAuth, selfOrigin } from '@/lib/features/onboarding/documentProxyServer'

export const dynamic = 'force-dynamic'

/**
 * POST /api/onboarding/documents — dedicated, binary-safe forward to
 * `POST /api/dealer_onboarding/dealer/onboarding/documents` (real multipart file upload, see
 * TASK-03's handoff). This file is a thin Next-specific wrapper; the actual transport —
 * resolving auth, building/forwarding the request — lives in documentProxyServer.ts, which has
 * no Next import and is exercised directly under `node --test` (see
 * tests/onboarding-document-transport.test.mjs), since `NextRequest`/`NextResponse` cannot be
 * constructed outside the Next runtime (verified — `next/server` fails to resolve under plain
 * `node --test`, consistent with how every existing test in this app avoids importing a
 * route.ts file directly).
 */
export async function POST(req: NextRequest) {
  const origin = selfOrigin(req.headers, req.nextUrl.protocol.replace(':', ''), req.nextUrl.host)
  if (!checkCsrf(req.method, req.headers.get('origin'), origin)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }

  const { authToken, refreshedSetCookie } = await resolveAuth({
    authToken: req.cookies.get('auth_token')?.value,
    sessionToken: req.cookies.get('session_token')?.value,
  })
  if (!authToken) {
    return NextResponse.json({ error: 'Authentication required', code: 'authentication_required' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  }

  let result: Awaited<ReturnType<typeof forwardUpload>>
  try {
    result = await forwardUpload({ authToken, form, forwardedFor: req.headers.get('x-forwarded-for') })
  } catch {
    return NextResponse.json({ error: 'The backend is unreachable. Please try again shortly.' }, { status: 502 })
  }

  const responseHeaders = new Headers({ 'cache-control': 'no-store', 'content-type': 'application/json' })
  if (result.retryAfter) responseHeaders.set('retry-after', result.retryAfter)
  if (refreshedSetCookie) responseHeaders.append('set-cookie', refreshedSetCookie)

  return new NextResponse(result.bodyText, { status: result.status, headers: responseHeaders })
}
