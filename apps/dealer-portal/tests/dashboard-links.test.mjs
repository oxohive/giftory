import { test } from 'node:test'
import assert from 'node:assert/strict'
import { orderListHref } from '../src/lib/features/dashboard/links.ts'

// These expected statuses are verified against apps/mercato's own
// dealer_orders/lib/dashboard.ts SQL filter and dealer_orders/data/validators.ts's
// assignmentListQuerySchema `status` field — not guessed — so a future change to either file
// without updating this one should be caught here.

test('pending-acknowledgment card links to the orders list filtered by the real "assigned" status', () => {
  assert.equal(orderListHref('pendingAcknowledgment'), '/orders?status=assigned')
})

test('in-production card links to status=in_production (matches the dashboard aggregate SQL filter)', () => {
  assert.equal(orderListHref('inProduction'), '/orders?status=in_production')
})

test('dispatched-this-week card links to status=dispatched (the orders list has no week-boundary filter of its own)', () => {
  assert.equal(orderListHref('dispatchedThisWeek'), '/orders?status=dispatched')
})
