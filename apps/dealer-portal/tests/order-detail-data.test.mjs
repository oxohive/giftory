import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ApiError } from '@gift/api-client'
import {
  DEALER_STATUS_TRANSITIONS,
  classifyOrderDetailError,
  fetchOrderDetail,
  formatProductionRequirements,
  isTerminalStatus,
  nextStatusFor,
  orderReferenceLabel,
  updateOrderStatus,
} from '../src/lib/features/orders/detail.ts'

/**
 * Mocks `global.fetch` only — `@gift/api-client`'s `request()` calls `fetch('/api/om/'+path)`
 * directly, so this exercises the real request-building/response-parsing code in detail.ts
 * against response bodies shaped exactly like tasks/phase-2-ui/API-CONTRACTS.md documents (the
 * same style tests/orders-list-data.test.mjs and tests/dashboard-queries.test.mjs already use in
 * this app). Never mocks detail.ts's own functions.
 */
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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function detailFixture(overrides = {}) {
  return {
    assignment: {
      assignmentId: 'assign-1',
      orderId: 'order-1',
      orderNumber: 'SO-2026-00042',
      status: 'assigned',
      statusNote: null,
      statusUpdatedAt: '2026-10-01T00:00:00.000Z',
      requiredBy: '2026-10-20',
      assignedAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      lines: [
        {
          id: 'line-1',
          productId: 'prod-1',
          variantId: 'variant-1',
          name: 'Engraved Mug',
          quantity: 2,
          giftMessage: 'Happy Birthday!',
          productionRequirements: { engravingText: 'Congrats', color: 'blue' },
        },
      ],
      shipping: { city: 'Pune', pincode: '411001' },
      ...overrides,
    },
  }
}

// --- Real backend transition graph (mirrored verbatim from
// apps/mercato/src/modules/dealer_orders/lib/constants.ts's DEALER_STATUS_TRANSITIONS — read
// directly from source, not guessed) -------------------------------------------------------------

test('the mirrored transition graph matches the real backend constants exactly', () => {
  assert.deepEqual(DEALER_STATUS_TRANSITIONS, {
    assigned: ['acknowledged'],
    acknowledged: ['in_production'],
    in_production: ['ready_for_dispatch'],
    ready_for_dispatch: ['dispatched'],
    dispatched: [],
    cancelled: [],
  })
})

test('nextStatusFor walks the full assigned -> dispatched sequence, one forward step at a time', () => {
  assert.equal(nextStatusFor('assigned'), 'acknowledged')
  assert.equal(nextStatusFor('acknowledged'), 'in_production')
  assert.equal(nextStatusFor('in_production'), 'ready_for_dispatch')
  assert.equal(nextStatusFor('ready_for_dispatch'), 'dispatched')
  assert.equal(nextStatusFor('dispatched'), null)
})

test('cancelled has no forward transition', () => {
  assert.equal(nextStatusFor('cancelled'), null)
})

test('isTerminalStatus is true only for dispatched and cancelled', () => {
  assert.equal(isTerminalStatus('assigned'), false)
  assert.equal(isTerminalStatus('acknowledged'), false)
  assert.equal(isTerminalStatus('in_production'), false)
  assert.equal(isTerminalStatus('ready_for_dispatch'), false)
  assert.equal(isTerminalStatus('dispatched'), true)
  assert.equal(isTerminalStatus('cancelled'), true)
})

test('no status ever offers a backward or sideways transition (every allowed-list entry moves strictly forward)', () => {
  const order = ['assigned', 'acknowledged', 'in_production', 'ready_for_dispatch', 'dispatched']
  for (const [status, allowed] of Object.entries(DEALER_STATUS_TRANSITIONS)) {
    if (status === 'cancelled') continue
    for (const target of allowed) {
      assert.ok(target !== 'cancelled' && target !== 'assigned', `${status} -> ${target} must not be a dealer-offered transition`)
      assert.ok(order.indexOf(target) > order.indexOf(status), `${status} -> ${target} must move strictly forward`)
    }
  }
})

// --- fetchOrderDetail -----------------------------------------------------------------------

test('fetchOrderDetail calls the documented assignment-id-keyed detail path and returns the safe projection unchanged', async () => {
  await withMockedFetch(
    (url) => {
      assert.match(url, /\/api\/om\/dealer_orders\/dealer\/orders\/assign-1$/)
      return jsonResponse(detailFixture())
    },
    async () => {
      const detail = await fetchOrderDetail('assign-1')
      assert.equal(detail.assignmentId, 'assign-1')
      assert.equal(detail.orderNumber, 'SO-2026-00042')
      assert.equal(detail.status, 'assigned')
      assert.equal(detail.shipping.city, 'Pune')
      assert.equal(detail.shipping.pincode, '411001')
      assert.equal(detail.lines.length, 1)
      assert.equal(detail.lines[0].giftMessage, 'Happy Birthday!')
      assert.equal(detail.lines[0].quantity, 2)
    },
  )
})

test('fetchOrderDetail URL-encodes the assignment id', async () => {
  await withMockedFetch(
    (url) => {
      assert.match(url, /dealer_orders\/dealer\/orders\/weird%2Fid$/)
      return jsonResponse(detailFixture({ assignmentId: 'weird/id' }))
    },
    () => fetchOrderDetail('weird/id'),
  )
})

// --- updateOrderStatus -----------------------------------------------------------------------

test('updateOrderStatus posts to the documented status path with status + trimmed note + updatedAt', async () => {
  await withMockedFetch(
    (url, init) => {
      assert.match(url, /\/api\/om\/dealer_orders\/dealer\/orders\/assign-1\/status$/)
      assert.equal(init.method, 'POST')
      assert.deepEqual(JSON.parse(init.body), {
        status: 'acknowledged',
        note: 'Starting soon',
        updatedAt: '2026-10-01T00:00:00.000Z',
      })
      return jsonResponse({ ok: true })
    },
    () => updateOrderStatus('assign-1', { status: 'acknowledged', note: '  Starting soon  ', updatedAt: '2026-10-01T00:00:00.000Z' }),
  )
})

test('updateOrderStatus omits note when blank/whitespace-only, and omits updatedAt when not given', async () => {
  await withMockedFetch(
    (url, init) => {
      assert.deepEqual(JSON.parse(init.body), { status: 'in_production' })
      return jsonResponse({ ok: true })
    },
    () => updateOrderStatus('assign-1', { status: 'in_production', note: '   ' }),
  )
})

// --- Full lifecycle, against real contract-shaped fixtures ------------------------------------

test('the full assigned -> acknowledged -> in_production -> ready_for_dispatch -> dispatched sequence succeeds end-to-end', async () => {
  const sequence = ['assigned', 'acknowledged', 'in_production', 'ready_for_dispatch', 'dispatched']
  let current = sequence[0]
  const postedStatuses = []

  await withMockedFetch(
    (url, init) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(init.body)
        postedStatuses.push(body.status)
        assert.equal(body.status, nextStatusFor(current), 'must only ever post the real next forward status')
        current = body.status
        return jsonResponse({ ok: true })
      }
      return jsonResponse(detailFixture({ status: current, updatedAt: '2026-10-01T00:00:00.000Z' }))
    },
    async () => {
      for (let i = 0; i < sequence.length - 1; i++) {
        const detail = await fetchOrderDetail('assign-1')
        const next = nextStatusFor(detail.status)
        assert.ok(next, `expected a forward transition from ${detail.status}`)
        await updateOrderStatus('assign-1', { status: next, updatedAt: detail.updatedAt })
      }
      assert.deepEqual(postedStatuses, ['acknowledged', 'in_production', 'ready_for_dispatch', 'dispatched'])
      assert.equal(current, 'dispatched')
      assert.equal(nextStatusFor(current), null, 'dispatched is terminal — no further transition is offered')
    },
  )
})

// --- Error classification — each distinct failure mode this task's acceptance criteria name ---

test('classifyOrderDetailError maps 401 -> unauthorized', async () => {
  await withMockedFetch(
    () => jsonResponse({ error: 'Unauthorized' }, 401),
    async () => {
      await assert.rejects(fetchOrderDetail('assign-1'), (err) => {
        assert.equal(classifyOrderDetailError(err), 'unauthorized')
        return true
      })
    },
  )
})

test('classifyOrderDetailError maps 403 -> forbidden (e.g. a caller lacking dealer_orders.dealer_access)', async () => {
  await withMockedFetch(
    () => jsonResponse({ error: 'Forbidden', requiredFeatures: ['dealer_orders.dealer_access'] }, 403),
    async () => {
      await assert.rejects(fetchOrderDetail('assign-1'), (err) => {
        assert.equal(classifyOrderDetailError(err), 'forbidden')
        return true
      })
    },
  )
})

test('classifyOrderDetailError maps 404 -> not_found (covers both a missing id and a cross-dealer guess — the backend returns the same 404 for both)', async () => {
  await withMockedFetch(
    () => jsonResponse({ error: 'not_found' }, 404),
    async () => {
      await assert.rejects(fetchOrderDetail('someone-elses-assignment-id'), (err) => {
        assert.equal(classifyOrderDetailError(err), 'not_found')
        return true
      })
    },
  )
})

test('an invalid/backward transition attempt is rejected (400) and surfaced with the real backend message, not swallowed', async () => {
  await withMockedFetch(
    () => jsonResponse({ error: 'Invalid status transition: dispatched → in_production', code: 'request_failed' }, 400),
    async () => {
      await assert.rejects(
        updateOrderStatus('assign-1', { status: 'in_production', updatedAt: '2026-10-01T00:00:00.000Z' }),
        (err) => {
          assert.equal(classifyOrderDetailError(err), 'invalid_transition')
          assert.equal(err.message, 'Invalid status transition: dispatched → in_production')
          return true
        },
      )
    },
  )
})

test('a stale/conflicting status transition attempt (409, version mismatch) is classified distinctly from a plain invalid transition', async () => {
  await withMockedFetch(
    () => jsonResponse({ error: 'This order was updated by someone else; reload and try again', code: 'request_failed' }, 409),
    async () => {
      await assert.rejects(
        updateOrderStatus('assign-1', { status: 'acknowledged', updatedAt: '2026-10-01T00:00:00.000Z' }),
        (err) => {
          assert.equal(classifyOrderDetailError(err), 'conflict')
          return true
        },
      )
    },
  )
})

test('classifyOrderDetailError never confuses a validation/invalid-transition failure (400) with a stale-version conflict (409)', () => {
  // Guards against the two being accidentally merged into one bucket, which would make the UI's
  // conflict ("reload and retry") and invalid-transition ("that's not allowed") copy indistinguishable.
  assert.equal(classifyOrderDetailError(new ApiError(400, 'Invalid status transition')), 'invalid_transition')
  assert.equal(classifyOrderDetailError(new ApiError(409, 'Stale write')), 'conflict')
  assert.notEqual(classifyOrderDetailError(new ApiError(400, 'x')), 'conflict')
  assert.notEqual(classifyOrderDetailError(new ApiError(409, 'x')), 'invalid_transition')
})

test('classifyOrderDetailError returns unknown for a non-ApiError throw (defensive — never crashes the error branch)', () => {
  assert.equal(classifyOrderDetailError(new Error('boom')), 'unknown')
  assert.equal(classifyOrderDetailError('a string'), 'unknown')
  assert.equal(classifyOrderDetailError(null), 'unknown')
})

// --- Display helpers ---------------------------------------------------------------------------

test('formatProductionRequirements prettifies camelCase keys and passes primitive values through', () => {
  const entries = formatProductionRequirements({ engravingText: 'Congrats', maxDailyCapacity: 10, isGift: true })
  assert.deepEqual(entries, [
    { label: 'Engraving text', value: 'Congrats' },
    { label: 'Max daily capacity', value: '10' },
    { label: 'Is gift', value: 'true' },
  ])
})

test('formatProductionRequirements skips null/undefined values and JSON-stringifies nested objects rather than dropping them', () => {
  const entries = formatProductionRequirements({ note: null, placement: { x: 1, y: 2 } })
  assert.deepEqual(entries, [{ label: 'Placement', value: JSON.stringify({ x: 1, y: 2 }) }])
})

test('formatProductionRequirements returns an empty list for null', () => {
  assert.deepEqual(formatProductionRequirements(null), [])
})

test('orderReferenceLabel never prints a bare id when the order number is missing', () => {
  assert.equal(orderReferenceLabel('SO-001'), 'SO-001')
  assert.equal(orderReferenceLabel(null), 'Order reference unavailable')
})
