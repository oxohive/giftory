import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkCsrf,
  cookieHeaderFor,
  forwardDownload,
  forwardUpload,
  resolveAuth,
  selfOrigin,
} from '../src/lib/features/onboarding/documentProxyServer.ts'

/**
 * Exercises documentProxyServer.ts — the transport this task built to replace the shared BFF
 * proxy specifically for KYC document upload/download — against a REAL local HTTP server shaped
 * like the actual `dealer_onboarding` routes (verified directly against
 * apps/mercato/src/modules/dealer_onboarding/api/dealer/onboarding/documents/route.ts and
 * .../documents/[id]/file/route.ts, not guessed), mirroring the pattern
 * tests/backend.test.mjs already established for the shared proxy's own equivalent logic.
 *
 * The one fact this suite exists specifically to prove end-to-end: a REAL binary file survives
 * this transport byte-for-byte. See documentProxyServer.ts's module doc comment for the earlier,
 * manually-verified corruption this was built to avoid (the shared proxy's text-based body
 * forwarding).
 */

// A real (if tiny) JPEG-looking byte sequence, including bytes that are NOT valid UTF-8 on
// their own — the exact property that made the shared proxy's `req.text()` forwarding lossy.
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x80, 0x81, 0x82, 0xc0, 0xc1, 0xfe])

let server
let baseUrl
let lastUploadReceivedBytes = null
let lastUploadCookie = null

before(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://internal')

    if (url.pathname === '/api/auth/session/refresh' && req.method === 'POST') {
      const chunks = []
      for await (const c of req) chunks.push(c)
      const { refreshToken } = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      if (refreshToken === 'good-refresh') {
        res.setHeader('set-cookie', ['auth_token=refreshed-token; Path=/; HttpOnly'])
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } else {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false }))
      }
      return
    }

    if (url.pathname === '/api/dealer_onboarding/dealer/onboarding/documents' && req.method === 'POST') {
      lastUploadCookie = req.headers.cookie ?? null
      const chunks = []
      for await (const c of req) chunks.push(c)
      const raw = Buffer.concat(chunks)
      lastUploadReceivedBytes = raw

      if (req.headers.cookie?.includes('auth_token=rate-limited-token')) {
        res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '37' })
        res.end(JSON.stringify({ error: 'Too many requests. Please try again later.' }))
        return
      }
      if (req.headers.cookie?.includes('auth_token=bad-status-token')) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Documents can only be uploaded while the application is pending or under review', code: 'request_failed' }))
        return
      }
      // Real success shape, per API-CONTRACTS.md's documented 201 body.
      res.writeHead(201, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ id: 'doc-1', documentType: 'pan_card', fileName: 'test.jpg' }))
      return
    }

    if (url.pathname === '/api/dealer_onboarding/dealer/onboarding/documents/doc-1/file' && req.method === 'GET') {
      if (!req.headers.cookie?.includes('auth_token=owner-token')) {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Authentication required', code: 'authentication_required' }))
        return
      }
      const headers = {
        'content-type': 'image/jpeg',
        'content-disposition': url.searchParams.get('download') === '1' ? 'attachment; filename="test.jpg"' : 'inline; filename="test.jpg"',
        'x-content-type-options': 'nosniff',
      }
      res.writeHead(200, headers)
      res.end(JEPG_RESPONSE_BYTES)
      return
    }

    if (url.pathname === '/api/dealer_onboarding/dealer/onboarding/documents/missing-doc/file' && req.method === 'GET') {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'KYC document not found', code: 'request_failed' }))
      return
    }

    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found in test server' }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  baseUrl = `http://127.0.0.1:${address.port}`
  process.env.OM_API_BASE_URL = baseUrl
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
})

const JEPG_RESPONSE_BYTES = JPEG_BYTES

// --- the core binary-fidelity proof ---

test('forwardUpload round-trips a real multipart file upload with zero byte corruption', async () => {
  const file = new File([JPEG_BYTES], 'test.jpg', { type: 'image/jpeg' })
  const form = new FormData()
  form.set('documentType', 'pan_card')
  form.set('file', file)

  const result = await forwardUpload({ authToken: 'owner-token', form })
  assert.equal(result.status, 201)
  assert.deepEqual(JSON.parse(result.bodyText), { id: 'doc-1', documentType: 'pan_card', fileName: 'test.jpg' })

  // The upstream "backend" received the FULL original byte sequence somewhere in its raw
  // multipart body — proving the transport never ran the bytes through a lossy text decode (the
  // exact corruption this task found and documented in the shared proxy's own body-forwarding).
  assert.ok(lastUploadReceivedBytes.includes(JPEG_BYTES), 'uploaded bytes must appear byte-for-byte in the raw request body')
})

test('forwardUpload sends the auth_token as a cookie, never any other credential shape', async () => {
  const file = new File([Buffer.from('x')], 'a.pdf', { type: 'application/pdf' })
  const form = new FormData()
  form.set('documentType', 'address_proof')
  form.set('file', file)
  await forwardUpload({ authToken: 'owner-token', form })
  assert.equal(lastUploadCookie, 'auth_token=owner-token')
})

test('forwardUpload passes through a real 429 with its exact Retry-After value', async () => {
  const file = new File([Buffer.from('x')], 'a.pdf', { type: 'application/pdf' })
  const form = new FormData()
  form.set('documentType', 'gst_certificate')
  form.set('file', file)
  const result = await forwardUpload({ authToken: 'rate-limited-token', form })
  assert.equal(result.status, 429)
  assert.equal(result.retryAfter, '37')
})

test('forwardUpload passes through a real 400 business-rule rejection unchanged', async () => {
  const file = new File([Buffer.from('x')], 'a.pdf', { type: 'application/pdf' })
  const form = new FormData()
  form.set('documentType', 'gst_certificate')
  form.set('file', file)
  const result = await forwardUpload({ authToken: 'bad-status-token', form })
  assert.equal(result.status, 400)
  const body = JSON.parse(result.bodyText)
  assert.equal(body.code, 'request_failed')
})

// --- download ---

test('forwardDownload streams the real bytes back with the real content-type/disposition', async () => {
  const response = await forwardDownload({ authToken: 'owner-token', documentId: 'doc-1', download: false })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/jpeg')
  assert.equal(response.headers.get('content-disposition'), 'inline; filename="test.jpg"')
  const bytes = Buffer.from(await response.arrayBuffer())
  assert.ok(bytes.equals(JPEG_BYTES))
})

test('forwardDownload sets download=1 through to the upstream for a forced download', async () => {
  const response = await forwardDownload({ authToken: 'owner-token', documentId: 'doc-1', download: true })
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="test.jpg"')
})

test('forwardDownload returns the real 401 when the auth token the caller has is not recognized', async () => {
  const response = await forwardDownload({ authToken: 'nonsense-token', documentId: 'doc-1', download: false })
  assert.equal(response.status, 401)
})

test('forwardDownload returns the real 404 for a document id the backend does not recognize', async () => {
  const response = await forwardDownload({ authToken: 'owner-token', documentId: 'missing-doc', download: false })
  assert.equal(response.status, 404)
})

// --- auth resolution ---

test('resolveAuth prefers an existing auth_token over refreshing', async () => {
  const result = await resolveAuth({ authToken: 'owner-token', sessionToken: 'whatever' })
  assert.deepEqual(result, { authToken: 'owner-token', refreshedSetCookie: null })
})

test('resolveAuth transparently refreshes from a session_token when no auth_token is present', async () => {
  const result = await resolveAuth({ sessionToken: 'good-refresh' })
  assert.equal(result.authToken, 'refreshed-token')
  assert.ok(result.refreshedSetCookie?.startsWith('auth_token=refreshed-token'))
})

test('resolveAuth resolves to no usable token when refresh fails, never throws', async () => {
  const result = await resolveAuth({ sessionToken: 'bad-refresh' })
  assert.deepEqual(result, { authToken: null, refreshedSetCookie: null })
})

test('resolveAuth resolves to no usable token when neither cookie is present', async () => {
  const result = await resolveAuth({})
  assert.deepEqual(result, { authToken: null, refreshedSetCookie: null })
})

// --- CSRF / origin ---

test('checkCsrf never blocks GET/HEAD regardless of Origin', () => {
  assert.equal(checkCsrf('GET', 'https://evil.example', 'https://dealer.example'), true)
  assert.equal(checkCsrf('HEAD', 'https://evil.example', 'https://dealer.example'), true)
})

test('checkCsrf trusts a same-origin POST and a POST with no Origin header at all', () => {
  assert.equal(checkCsrf('POST', 'https://dealer.example', 'https://dealer.example'), true)
  assert.equal(checkCsrf('POST', null, 'https://dealer.example'), true)
})

test('checkCsrf rejects a cross-site POST', () => {
  assert.equal(checkCsrf('POST', 'https://evil.example', 'https://dealer.example'), false)
})

test('selfOrigin prefers forwarded proto/host over the fallback (reverse-proxy correctness)', () => {
  const headers = new Headers({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'dealer.giftory.example' })
  assert.equal(selfOrigin(headers, 'http', 'localhost:3200'), 'https://dealer.giftory.example')
})

test('selfOrigin falls back to the plain host header, then the given fallback', () => {
  const withHost = new Headers({ host: 'localhost:3200' })
  assert.equal(selfOrigin(withHost, 'http', 'ignored'), 'http://localhost:3200')
  const withNeither = new Headers()
  assert.equal(selfOrigin(withNeither, 'http', 'localhost:3200'), 'http://localhost:3200')
})

test('cookieHeaderFor builds a single auth_token cookie, or null when there is nothing to send', () => {
  assert.equal(cookieHeaderFor('abc'), 'auth_token=abc')
  assert.equal(cookieHeaderFor(null), null)
})
