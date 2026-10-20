import { NextResponse, type NextRequest } from 'next/server'
import { forwardDownload, resolveAuth } from '@/lib/features/onboarding/documentProxyServer'

export const dynamic = 'force-dynamic'

/**
 * GET /api/onboarding/documents/:id/file — dedicated forward to
 * `GET /api/dealer_onboarding/dealer/onboarding/documents/:id/file` (the caller's own KYC
 * document, TASK-03). Not on the shared `/api/om/*` proxy's allowlist at all (GET isn't listed
 * for this sub-path there — see `@/lib/http/allowlist.ts`, outside this task's owned paths).
 * Thin Next-specific wrapper — see documentProxyServer.ts for the actual transport and why it
 * is tested separately from this file (NextRequest/NextResponse cannot run under plain
 * `node --test`).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })

  const { authToken } = await resolveAuth({
    authToken: req.cookies.get('auth_token')?.value,
    sessionToken: req.cookies.get('session_token')?.value,
  })
  if (!authToken) {
    return NextResponse.json({ error: 'Authentication required', code: 'authentication_required' }, { status: 401 })
  }

  let upstream: Response
  try {
    upstream = await forwardDownload({ authToken, documentId: id, download: req.nextUrl.searchParams.get('download') === '1' })
  } catch {
    return NextResponse.json({ error: 'The backend is unreachable. Please try again shortly.' }, { status: 502 })
  }

  const responseHeaders = new Headers({ 'cache-control': 'private, max-age=60' })
  for (const name of ['content-type', 'content-disposition', 'x-content-type-options', 'content-security-policy']) {
    const value = upstream.headers.get(name)
    if (value) responseHeaders.set(name, value)
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders })
}
