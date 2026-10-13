import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'

/**
 * Exercises src/lib/auth/backend.ts against a real local HTTP server shaped like the documented
 * apps/mercato responses (tasks/phase-2-ui/API-CONTRACTS.md's standard response shapes, and the
 * verified core-auth profile/refresh contracts from TASK-01's handoff) — not a mock of this
 * module itself. backend.ts has no Next-specific API surface (only `fetch`/`process.env`), which
 * is exactly why it is kept separate from session.ts (which does, and therefore cannot run
 * outside a real Next request).
 */

let server
let baseUrl

function readCookie(req, name) {
  const header = req.headers.cookie || ''
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match ? match[1] : null
}

before(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://internal')
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const rawBody = Buffer.concat(chunks).toString('utf8')

    if (url.pathname === '/api/auth/session/refresh' && req.method === 'POST') {
      const { refreshToken } = rawBody ? JSON.parse(rawBody) : {}
      if (refreshToken === 'good-refresh') {
        res.setHeader('set-cookie', ['auth_token=refreshed-token; Path=/; HttpOnly'])
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, accessToken: 'refreshed-token', expiresIn: 28800 }))
      } else {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Invalid or expired refresh token' }))
      }
      return
    }

    if (url.pathname === '/api/auth/profile' && req.method === 'GET') {
      const authToken = readCookie(req, 'auth_token')
      const byToken = {
        'owner-approved-token': ['dealer:owner'],
        'owner-pending-token': ['dealer:owner'],
        'owner-rejected-token': ['dealer:owner'],
        'owner-noprofile-token': ['dealer:owner'],
        'staff-token': ['dealer:staff'],
        'employee-token': ['employee'],
        'refreshed-token': ['dealer:owner'],
      }
      const roles = authToken ? byToken[authToken] : undefined
      if (!roles) {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Unauthorized' }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ email: 'dealer@example.com', name: null, roles }))
      return
    }

    if (url.pathname === '/api/dealer_onboarding/dealer/onboarding/status' && req.method === 'GET') {
      const authToken = readCookie(req, 'auth_token')
      if (authToken === 'owner-approved-token') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ kycStatus: 'approved', rejectionReason: null, documents: [] }))
        return
      }
      if (authToken === 'owner-pending-token') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ kycStatus: 'pending_verification', rejectionReason: null, documents: [] }))
        return
      }
      if (authToken === 'owner-rejected-token') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ kycStatus: 'rejected', rejectionReason: 'Invalid GSTIN', documents: [] }))
        return
      }
      if (authToken === 'owner-noprofile-token') {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Dealer profile not found', code: 'profile_not_found' }))
        return
      }
      if (authToken === 'employee-token') {
        res.writeHead(403, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Forbidden', requiredFeatures: ['dealer_onboarding.view_own'] }))
        return
      }
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Authentication required', code: 'authentication_required' }))
      return
    }

    if (url.pathname === '/api/auth/reset/validate' && req.method === 'POST') {
      const params = new URLSearchParams(rawBody)
      const valid = params.get('token') === 'valid-token'
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, valid }))
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

test('fetchAuthProfile resolves roles for a valid token', async () => {
  const { fetchAuthProfile } = await import('../src/lib/auth/backend.ts')
  const result = await fetchAuthProfile('owner-approved-token')
  assert.deepEqual(result, { ok: true, roles: ['dealer:owner'], email: 'dealer@example.com', name: null })
})

test('fetchAuthProfile reports not-ok for an invalid/expired token — never throws', async () => {
  const { fetchAuthProfile } = await import('../src/lib/auth/backend.ts')
  const result = await fetchAuthProfile('garbage-token')
  assert.equal(result.ok, false)
  assert.deepEqual(result.roles, [])
})

test('fetchOnboardingStatus maps 200/approved correctly', async () => {
  const { fetchOnboardingStatus } = await import('../src/lib/auth/backend.ts')
  const result = await fetchOnboardingStatus('owner-approved-token')
  assert.equal(result.status, 'ok')
  assert.equal(result.kycStatus, 'approved')
})

test('fetchOnboardingStatus maps 404 profile_not_found to not_found', async () => {
  const { fetchOnboardingStatus } = await import('../src/lib/auth/backend.ts')
  const result = await fetchOnboardingStatus('owner-noprofile-token')
  assert.equal(result.status, 'not_found')
})

test('fetchOnboardingStatus maps 403 to forbidden', async () => {
  const { fetchOnboardingStatus } = await import('../src/lib/auth/backend.ts')
  const result = await fetchOnboardingStatus('employee-token')
  assert.equal(result.status, 'forbidden')
})

test('fetchOnboardingStatus maps 401 to unauthorized', async () => {
  const { fetchOnboardingStatus } = await import('../src/lib/auth/backend.ts')
  const result = await fetchOnboardingStatus('garbage-token')
  assert.equal(result.status, 'unauthorized')
})

test('fetchOnboardingStatus carries the rejection reason through on a rejected profile', async () => {
  const { fetchOnboardingStatus } = await import('../src/lib/auth/backend.ts')
  const result = await fetchOnboardingStatus('owner-rejected-token')
  assert.equal(result.kycStatus, 'rejected')
  assert.equal(result.rejectionReason, 'Invalid GSTIN')
})

test('refreshAuthToken returns the new auth_token value from Set-Cookie on success', async () => {
  const { refreshAuthToken } = await import('../src/lib/auth/backend.ts')
  const result = await refreshAuthToken('good-refresh')
  assert.equal(result, 'refreshed-token')
})

test('refreshAuthToken returns null for an invalid/expired refresh token — never throws', async () => {
  const { refreshAuthToken } = await import('../src/lib/auth/backend.ts')
  const result = await refreshAuthToken('bad-refresh')
  assert.equal(result, null)
})

test('a refreshed auth_token resolves a usable profile end to end', async () => {
  const { refreshAuthToken, fetchAuthProfile } = await import('../src/lib/auth/backend.ts')
  const refreshed = await refreshAuthToken('good-refresh')
  const profile = await fetchAuthProfile(refreshed)
  assert.equal(profile.ok, true)
  assert.deepEqual(profile.roles, ['dealer:owner'])
})

test('validateResetToken reports true only for the valid token', async () => {
  const { validateResetToken } = await import('../src/lib/auth/backend.ts')
  assert.equal(await validateResetToken('valid-token'), true)
  assert.equal(await validateResetToken('expired-or-unknown'), false)
})

test('backend calls never throw when the upstream is unreachable', async () => {
  const previous = process.env.OM_API_BASE_URL
  process.env.OM_API_BASE_URL = 'http://127.0.0.1:1' // nothing listens here
  const { fetchAuthProfile, fetchOnboardingStatus, refreshAuthToken, validateResetToken } = await import('../src/lib/auth/backend.ts')
  try {
    assert.deepEqual(await fetchAuthProfile('x'), { ok: false, roles: [] })
    assert.equal((await fetchOnboardingStatus('x')).status, 'error')
    assert.equal(await refreshAuthToken('x'), null)
    assert.equal(await validateResetToken('x'), false)
  } finally {
    process.env.OM_API_BASE_URL = previous
  }
})
