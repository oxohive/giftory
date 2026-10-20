import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_ORDERS_LIST_STATE,
  enrichAssignments,
  fetchOrdersListPage,
  orderReferenceLabel,
  summarizeOrderLines,
} from '../src/lib/features/orders/list.ts'

// --- summarizeOrderLines: pure display logic, no fetch involved.

test('summarizes a single line', () => {
  assert.equal(summarizeOrderLines([{ name: 'Mug', quantity: 2 }]), 'Mug x2')
})

test('summarizes two lines without an "+N more" suffix', () => {
  assert.equal(
    summarizeOrderLines([
      { name: 'Mug', quantity: 2 },
      { name: 'Photo frame', quantity: 1 },
    ]),
    'Mug x2, Photo frame x1',
  )
})

test('summarizes more than two lines with a "+N more" suffix, showing only the first two', () => {
  const lines = [
    { name: 'Mug', quantity: 2 },
    { name: 'Photo frame', quantity: 1 },
    { name: 'Keychain', quantity: 3 },
    { name: 'Tote bag', quantity: 1 },
  ]
  assert.equal(summarizeOrderLines(lines), 'Mug x2, Photo frame x1 +2 more')
})

test('falls back to a generic label for a line with no catalog name, rather than rendering blank', () => {
  assert.equal(summarizeOrderLines([{ name: null, quantity: 1 }]), 'Item x1')
})

test('reports no product details for an order with zero lines, rather than an empty string', () => {
  assert.equal(summarizeOrderLines([]), 'No product details')
})

// --- orderReferenceLabel: never a bare UUID.

test('uses the real order number when present', () => {
  assert.equal(orderReferenceLabel('SO-2026-00042'), 'SO-2026-00042')
})

test('falls back to an explicit label (never a raw id) when the order number is missing', () => {
  assert.equal(orderReferenceLabel(null), 'Order reference unavailable')
})

// --- enrichAssignments / fetchOrdersListPage: exercised against a mocked fetch returning real
// contract-shaped fixtures (GET .../dealer/orders + GET .../dealer/orders/{assignmentId}), per
// API-CONTRACTS.md's documented response shapes — not a mock of this module's own functions.

function detailResponse(assignmentId, orderNumber, requiredBy, lineName) {
  return {
    assignment: {
      assignmentId,
      orderId: `order-${assignmentId}`,
      orderNumber,
      status: 'assigned',
      statusNote: null,
      statusUpdatedAt: '2026-10-01T00:00:00.000Z',
      requiredBy,
      assignedAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      lines: [{ id: 'l1', productId: null, variantId: null, name: lineName, quantity: 1, giftMessage: null, productionRequirements: null }],
      shipping: { city: 'Pune', pincode: '411001' },
    },
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function withMockedFetch(responder, run) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return responder(String(url), init)
  }
  return run(calls).finally(() => {
    globalThis.fetch = original
  })
}

test('enrichAssignments preserves the exact order it was given, even when one row\'s detail fails', async () => {
  const items = [
    { id: 'a1', orderId: 'o1', status: 'assigned', requiredBy: '2026-11-01', assignedAt: '2026-10-01T00:00:00.000Z' },
    { id: 'a2', orderId: 'o2', status: 'acknowledged', requiredBy: '2026-11-05', assignedAt: '2026-10-02T00:00:00.000Z' },
    { id: 'a3', orderId: 'o3', status: 'in_production', requiredBy: '2026-11-10', assignedAt: '2026-10-03T00:00:00.000Z' },
  ]
  await withMockedFetch(
    (url) => {
      if (url.includes('/dealer_orders/dealer/orders/a2')) return jsonResponse({ error: 'not_found' }, 404)
      if (url.includes('/dealer_orders/dealer/orders/a1')) return jsonResponse(detailResponse('a1', 'SO-001', '2026-11-01', 'Mug'))
      if (url.includes('/dealer_orders/dealer/orders/a3')) return jsonResponse(detailResponse('a3', 'SO-003', '2026-11-10', 'Frame'))
      throw new Error(`unexpected fetch: ${url}`)
    },
    async () => {
      const rows = await enrichAssignments(items)
      assert.deepEqual(rows.map((r) => r.assignmentId), ['a1', 'a2', 'a3'])
      assert.equal(rows[0].orderReference, 'SO-001')
      assert.equal(rows[0].detailError, false)
      // a2's detail fetch 404s — the row still renders with a safe fallback, not an exception.
      assert.equal(rows[1].detailError, true)
      assert.equal(rows[1].orderReference, 'Order reference unavailable')
      assert.equal(rows[1].status, 'acknowledged')
      assert.equal(rows[2].orderReference, 'SO-003')
    },
  )
})

test('fetchOrdersListPage never reorders the backend\'s list order (a client-side sort here would silently break cross-page ordering)', async () => {
  const listFixture = {
    items: [
      { id: 'a3', orderId: 'o3', status: 'assigned', requiredBy: '2026-11-10', assignedAt: '2026-10-03T00:00:00.000Z' },
      { id: 'a1', orderId: 'o1', status: 'assigned', requiredBy: '2026-11-01', assignedAt: '2026-10-01T00:00:00.000Z' },
      { id: 'a2', orderId: 'o2', status: 'assigned', requiredBy: '2026-11-05', assignedAt: '2026-10-02T00:00:00.000Z' },
    ],
    total: 3,
    page: 1,
    pageSize: 25,
  }
  await withMockedFetch(
    (url) => {
      if (url.includes('/dealer_orders/dealer/orders?')) return jsonResponse(listFixture)
      const match = /dealer_orders\/dealer\/orders\/(a\d)$/.exec(url)
      if (match) return jsonResponse(detailResponse(match[1], `SO-${match[1]}`, '2026-11-01', 'Item'))
      throw new Error(`unexpected fetch: ${url}`)
    },
    async () => {
      const page = await fetchOrdersListPage(DEFAULT_ORDERS_LIST_STATE)
      // The backend returned a3, a1, a2 in THAT order (deliberately not pre-sorted here, to prove
      // this function doesn't quietly impose its own order) — the enriched result must match it
      // exactly, item for item.
      assert.deepEqual(page.items.map((r) => r.assignmentId), ['a3', 'a1', 'a2'])
    },
  )
})

test('requests the same sortField/sortDir for page 1 and page 2 of the same view (the sort never drifts mid-browse)', async () => {
  const emptyPage = (page) => ({ items: [], total: 0, page, pageSize: 25 })
  await withMockedFetch(
    (url) => {
      if (url.includes('page=1')) return jsonResponse(emptyPage(1))
      if (url.includes('page=2')) return jsonResponse(emptyPage(2))
      return jsonResponse(emptyPage(1))
    },
    async (calls) => {
      await fetchOrdersListPage({ ...DEFAULT_ORDERS_LIST_STATE, page: 1 })
      await fetchOrdersListPage({ ...DEFAULT_ORDERS_LIST_STATE, page: 2 })
      const listCalls = calls.filter((c) => c.url.includes('/dealer_orders/dealer/orders?'))
      assert.equal(listCalls.length, 2)
      const sortParamsOf = (url) => {
        const u = new URL(url, 'http://localhost')
        return `${u.searchParams.get('sortField')}:${u.searchParams.get('sortDir')}`
      }
      assert.equal(sortParamsOf(listCalls[0].url), sortParamsOf(listCalls[1].url))
      assert.equal(sortParamsOf(listCalls[0].url), 'requiredBy:asc')
    },
  )
})
