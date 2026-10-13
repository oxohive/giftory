import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ApiError, buildQuery, request } from '../src/index.ts'

const originalFetch = globalThis.fetch

function mockFetch(status, body, headers = { 'content-type': 'application/json' }) {
  globalThis.fetch = async () => new Response(body === undefined ? '' : JSON.stringify(body), { status, headers })
}

test.afterEach(() => {
  globalThis.fetch = originalFetch
})

test('maps 401 to a session-expiry message (real contract shape: {"error":"Unauthorized"})', async () => {
  mockFetch(401, { error: 'Unauthorized' })
  await assert.rejects(request('dealer_orders/dealer/orders'), (err) => {
    assert.ok(err instanceof ApiError)
    assert.equal(err.status, 401)
    assert.ok(err.isUnauthorized)
    assert.match(err.message, /session has expired/i)
    return true
  })
})

test('maps 403 and keeps requiredFeatures (real contract shape)', async () => {
  mockFetch(403, { error: 'Forbidden', requiredFeatures: ['dealer_orders.dealer_access'] })
  await assert.rejects(request('dealer_orders/dealer/orders'), (err) => {
    assert.equal(err.status, 403)
    assert.ok(err.isForbidden)
    assert.deepEqual(err.requiredFeatures, ['dealer_orders.dealer_access'])
    return true
  })
})

test('surfaces 422 validation details from the real contract shape (details, not fieldErrors)', async () => {
  mockFetch(422, { error: 'Invalid request', code: 'invalid_request', details: [{ path: 'email', message: 'Required' }] })
  await assert.rejects(
    request('dealer_onboarding/dealer/onboarding/register', { method: 'POST', body: '{}' }),
    (err) => {
      assert.equal(err.status, 422)
      assert.ok(err.isValidation)
      assert.equal(err.code, 'invalid_request')
      assert.deepEqual(err.details, [{ path: 'email', message: 'Required' }])
      return true
    },
  )
})

test('maps 429 to a rate-limit message', async () => {
  mockFetch(429, { error: 'Too many requests' })
  await assert.rejects(request('dealer_onboarding/dealer/onboarding/register', { method: 'POST', body: '{}' }), (err) => {
    assert.equal(err.status, 429)
    assert.ok(err.isRateLimited)
    assert.match(err.message, /too many attempts/i)
    return true
  })
})

test('falls back to the body error message for 400/404/409 (request_failed code)', async () => {
  mockFetch(409, { error: 'An active assignment already exists', code: 'request_failed' })
  await assert.rejects(request('dealer_orders/admin/orders/1/assignment', { method: 'POST' }), (err) => {
    assert.equal(err.status, 409)
    assert.equal(err.message, 'An active assignment already exists')
    return true
  })
})

test('returns parsed JSON on success', async () => {
  mockFetch(200, { items: [], total: 0, page: 1, pageSize: 25 })
  const result = await request('dealer_orders/dealer/orders')
  assert.deepEqual(result, { items: [], total: 0, page: 1, pageSize: 25 })
})

test('surfaces a network failure as a status-0 ApiError, distinct from a real HTTP error', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed')
  }
  await assert.rejects(request('dealer_orders/dealer/orders'), (err) => {
    assert.ok(err instanceof ApiError)
    assert.ok(err.isNetworkError)
    return true
  })
})

test('buildQuery drops empty/null/undefined values and keeps the rest', () => {
  assert.equal(buildQuery({ page: 1, pageSize: 25, search: '', state: null, sortDir: undefined }), '?page=1&pageSize=25')
  assert.equal(buildQuery(), '')
  assert.equal(buildQuery({}), '')
})
