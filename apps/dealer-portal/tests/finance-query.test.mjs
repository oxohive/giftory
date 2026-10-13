import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildEarningsQuery, buildLedgerQuery, DEFAULT_PAGE_SIZE, LEDGER_DIRECTIONS, LEDGER_ENTRY_TYPES } from '../src/lib/features/finance/query.ts'

// --- buildEarningsQuery: GET /api/commissions/dealer/earnings supports page/pageSize only (as
// a UI-exposed filter) — this never sends anything else, in particular never a dealerProfileId.

test('earnings query defaults page/pageSize when omitted or invalid', () => {
  assert.deepEqual(buildEarningsQuery({ page: 1 }), { page: 1, pageSize: DEFAULT_PAGE_SIZE })
  assert.deepEqual(buildEarningsQuery({ page: 0 }), { page: 1, pageSize: DEFAULT_PAGE_SIZE })
  assert.deepEqual(buildEarningsQuery({ page: -5 }), { page: 1, pageSize: DEFAULT_PAGE_SIZE })
  assert.deepEqual(buildEarningsQuery({ page: 2.5 }), { page: 1, pageSize: DEFAULT_PAGE_SIZE })
})

test('earnings query clamps pageSize to the backend-documented 1-100 range', () => {
  assert.deepEqual(buildEarningsQuery({ page: 1, pageSize: 0 }), { page: 1, pageSize: 1 })
  assert.deepEqual(buildEarningsQuery({ page: 1, pageSize: 500 }), { page: 1, pageSize: 100 })
  assert.deepEqual(buildEarningsQuery({ page: 1, pageSize: 10 }), { page: 1, pageSize: 10 })
})

test('earnings query never produces a dealerProfileId key', () => {
  const query = buildEarningsQuery({ page: 3, pageSize: 25 })
  assert.deepEqual(Object.keys(query).sort(), ['page', 'pageSize'])
})

// --- buildLedgerQuery: GET /api/payouts/dealer/ledger supports page/pageSize + entryType/direction.

test('ledger query includes page/pageSize only when no filter is set', () => {
  assert.deepEqual(buildLedgerQuery({ page: 1 }), { page: 1, pageSize: DEFAULT_PAGE_SIZE })
})

test('ledger query includes a valid entryType filter', () => {
  for (const entryType of LEDGER_ENTRY_TYPES) {
    assert.deepEqual(buildLedgerQuery({ page: 1, entryType }), { page: 1, pageSize: DEFAULT_PAGE_SIZE, entryType })
  }
})

test('ledger query includes a valid direction filter', () => {
  for (const direction of LEDGER_DIRECTIONS) {
    assert.deepEqual(buildLedgerQuery({ page: 1, direction }), { page: 1, pageSize: DEFAULT_PAGE_SIZE, direction })
  }
})

test('ledger query combines entryType and direction', () => {
  assert.deepEqual(buildLedgerQuery({ page: 2, pageSize: 10, entryType: 'adjustment_debit', direction: 'debit' }), {
    page: 2,
    pageSize: 10,
    entryType: 'adjustment_debit',
    direction: 'debit',
  })
})

test('ledger query drops an empty-string filter rather than sending it', () => {
  assert.deepEqual(buildLedgerQuery({ page: 1, entryType: '', direction: '' }), { page: 1, pageSize: DEFAULT_PAGE_SIZE })
})

test('ledger query drops an unrecognized filter value defensively (not just a TS-level guarantee)', () => {
  // @ts-expect-error — exercising runtime behavior for a value TypeScript would already reject
  const query = buildLedgerQuery({ page: 1, entryType: 'not_a_real_type', direction: 'sideways' })
  assert.deepEqual(query, { page: 1, pageSize: DEFAULT_PAGE_SIZE })
})

test('ledger query never produces a dealerProfileId key', () => {
  const query = buildLedgerQuery({ page: 1, entryType: 'commission_earned', direction: 'credit' })
  assert.deepEqual(Object.keys(query).sort(), ['direction', 'entryType', 'page', 'pageSize'])
})
