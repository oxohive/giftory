import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchCapacity, fetchDashboardAggregate, fetchRecentActivity } from '../src/lib/features/dashboard/queries.ts'

/**
 * Mocks `global.fetch` only — `@gift/api-client`'s `request()` calls `fetch('/api/om/'+path)`
 * directly, so this exercises the real request-building/response-parsing code in queries.ts
 * against response bodies shaped exactly like tasks/phase-2-ui/API-CONTRACTS.md documents, the
 * same style tests/backend.test.mjs (P2-UI-04) and tests/reset-form.test.mjs already use in this
 * app. Never mocks queries.ts's own functions.
 */
function withMockFetch(handler, run) {
  const original = global.fetch
  global.fetch = async (input, init) => handler(String(input), init)
  return run().finally(() => {
    global.fetch = original
  })
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('fetchDashboardAggregate calls the documented dashboard aggregate path and passes the count through unchanged', async () => {
  const calls = []
  await withMockFetch(
    (url) => {
      calls.push(url)
      // A count larger than any single page (proves this layer never trims/paginates the
      // aggregate it is handed — the backend is already verified, per TASK-03's own handoff, to
      // compute this with a count of 250 across more than one page worth of rows).
      return jsonResponse(200, {
        pendingAcknowledgment: 250,
        inProduction: 3,
        dispatchedThisWeek: 7,
        weekStartsAt: '2026-01-04T18:30:00.000Z',
        timezone: 'Asia/Kolkata',
      })
    },
    async () => {
      const result = await fetchDashboardAggregate()
      assert.deepEqual(result, {
        pendingAcknowledgment: 250,
        inProduction: 3,
        dispatchedThisWeek: 7,
        weekStartsAt: '2026-01-04T18:30:00.000Z',
        timezone: 'Asia/Kolkata',
      })
    },
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0], '/api/om/dealer_orders/dealer/dashboard')
})

test('fetchDashboardAggregate surfaces a real 404 (e.g. the documented proxy-allowlist gap) as a readable ApiError, not a crash', async () => {
  await withMockFetch(
    () => jsonResponse(404, { error: 'Not available' }),
    async () => {
      await assert.rejects(fetchDashboardAggregate(), (error) => {
        assert.equal(error.name, 'ApiError')
        assert.equal(error.status, 404)
        return true
      })
    },
  )
})

test('fetchCapacity reads capabilities.maxDailyCapacity from the dealer_org_rbac profile response and reports not-configured on the documented zero default', async () => {
  await withMockFetch(
    (url) => {
      assert.equal(url, '/api/om/dealer_org_rbac/dealer/profile')
      return jsonResponse(200, {
        id: 'profile-1',
        organizationId: 'org-1',
        businessName: 'Acme Prints',
        capabilities: {
          productTypeCodes: [],
          printingMethods: [],
          maxDailyCapacity: 0,
          serviceableStates: [],
          minOrderQty: 1,
        },
      })
    },
    async () => {
      const result = await fetchCapacity()
      assert.deepEqual(result, { configured: false, maxDailyCapacity: 0 })
    },
  )
})

test('fetchCapacity reports a real configured capacity value unchanged', async () => {
  await withMockFetch(
    () =>
      jsonResponse(200, {
        id: 'profile-1',
        organizationId: 'org-1',
        businessName: 'Acme Prints',
        capabilities: {
          productTypeCodes: ['mug'],
          printingMethods: ['sublimation'],
          maxDailyCapacity: 40,
          serviceableStates: ['IN-KA'],
          minOrderQty: 1,
        },
      }),
    async () => {
      const result = await fetchCapacity()
      assert.deepEqual(result, { configured: true, maxDailyCapacity: 40 })
    },
  )
})

test('fetchRecentActivity requests the real orders-list endpoint sorted newest-assigned-first, with a small fixed page size', async () => {
  const calls = []
  await withMockFetch(
    (url) => {
      calls.push(url)
      return jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 5 })
    },
    () => fetchRecentActivity(),
  )
  assert.equal(calls.length, 1)
  const url = new URL(calls[0], 'http://localhost')
  assert.equal(url.pathname, '/api/om/dealer_orders/dealer/orders')
  assert.equal(url.searchParams.get('sortField'), 'assignedAt')
  assert.equal(url.searchParams.get('sortDir'), 'desc')
  assert.equal(url.searchParams.get('page'), '1')
  assert.equal(url.searchParams.get('pageSize'), '5')
})

test('fetchRecentActivity returns items/total straight from the real contract shape, including the "no orders yet" (total 0) case', async () => {
  await withMockFetch(
    () => jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 5 }),
    async () => {
      const result = await fetchRecentActivity()
      assert.deepEqual(result, { items: [], total: 0 })
    },
  )
})

test('fetchRecentActivity passes real assignment rows through unchanged (no re-shaping, no synthetic fields)', async () => {
  const assignment = {
    id: 'assignment-1',
    orderId: 'order-1',
    dealerProfileId: 'dealer-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    assignedBy: 'user-1',
    assignedAt: '2026-01-05T09:00:00.000Z',
    requiredBy: '2026-01-10',
    status: 'in_production',
    statusUpdatedAt: '2026-01-06T09:00:00.000Z',
    statusNote: null,
    cancelledReason: null,
    updatedAt: '2026-01-06T09:00:00.000Z',
  }
  await withMockFetch(
    () => jsonResponse(200, { items: [assignment], total: 1, page: 1, pageSize: 5 }),
    async () => {
      const result = await fetchRecentActivity()
      assert.deepEqual(result, { items: [assignment], total: 1 })
    },
  )
})
