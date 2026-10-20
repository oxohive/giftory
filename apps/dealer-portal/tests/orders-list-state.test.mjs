import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOrdersListSearch,
  buildOrdersQuery,
  DEFAULT_ORDERS_LIST_STATE,
  parseOrdersListState,
  sortKeyFor,
  sortOptionForKey,
} from '../src/lib/features/orders/list.ts'

// --- parseOrdersListState: the URL is the single source of truth for page/status/sort. Every
// missing or malformed value must default rather than ever reach the backend unvalidated.

test('parses an empty query string to this page\'s own default state (deadline, soonest first)', () => {
  const state = parseOrdersListState(new URLSearchParams(''))
  assert.deepEqual(state, DEFAULT_ORDERS_LIST_STATE)
})

test('parses a real status value from the URL', () => {
  const state = parseOrdersListState(new URLSearchParams('status=in_production'))
  assert.equal(state.status, 'in_production')
})

test('rejects an unrecognized status value rather than forwarding it to the backend', () => {
  const state = parseOrdersListState(new URLSearchParams('status=not_a_real_status'))
  assert.equal(state.status, '')
})

test('parses real sortField/sortDir values', () => {
  const state = parseOrdersListState(new URLSearchParams('sortField=assignedAt&sortDir=desc'))
  assert.equal(state.sortField, 'assignedAt')
  assert.equal(state.sortDir, 'desc')
})

test('rejects an unrecognized sortField/sortDir, falling back to the page default', () => {
  const state = parseOrdersListState(new URLSearchParams('sortField=subtotal&sortDir=sideways'))
  assert.equal(state.sortField, DEFAULT_ORDERS_LIST_STATE.sortField)
  assert.equal(state.sortDir, DEFAULT_ORDERS_LIST_STATE.sortDir)
})

test('parses a valid page number', () => {
  assert.equal(parseOrdersListState(new URLSearchParams('page=3')).page, 3)
})

test('rejects a non-integer, zero, or negative page, defaulting to 1', () => {
  assert.equal(parseOrdersListState(new URLSearchParams('page=0')).page, 1)
  assert.equal(parseOrdersListState(new URLSearchParams('page=-5')).page, 1)
  assert.equal(parseOrdersListState(new URLSearchParams('page=2.5')).page, 1)
  assert.equal(parseOrdersListState(new URLSearchParams('page=not-a-number')).page, 1)
})

// --- buildOrdersListSearch: the URL display form. Round-trips through parse for every state a
// user can actually reach via the UI's own controls (status filter, sort dropdown, pagination).

test('round-trips default state back to an empty query string', () => {
  assert.equal(buildOrdersListSearch(DEFAULT_ORDERS_LIST_STATE), '')
})

test('round-trips a non-default state through build -> parse', () => {
  const state = { page: 3, status: 'dispatched', sortField: 'assignedAt', sortDir: 'desc' }
  const search = buildOrdersListSearch(state)
  const reparsed = parseOrdersListState(new URLSearchParams(search.replace(/^\?/, '')))
  assert.deepEqual(reparsed, state)
})

test('omits page from the URL when it is 1 (the common case), but includes it otherwise', () => {
  assert.doesNotMatch(buildOrdersListSearch({ ...DEFAULT_ORDERS_LIST_STATE, page: 1 }), /page=/)
  assert.match(buildOrdersListSearch({ ...DEFAULT_ORDERS_LIST_STATE, page: 2 }), /page=2/)
})

// --- buildOrdersQuery: the actual GET .../dealer/orders query. Must always send sortField/sortDir
// explicitly, since this page's own default (requiredBy asc) differs from the backend's bare
// default (assignedAt desc) — an omitted sort param here would silently request the WRONG sort.

test('always sends sortField and sortDir explicitly, even at this page\'s own default', () => {
  const query = buildOrdersQuery(DEFAULT_ORDERS_LIST_STATE)
  assert.equal(query.sortField, 'requiredBy')
  assert.equal(query.sortDir, 'asc')
})

test('omits status from the query when no filter is active', () => {
  const query = buildOrdersQuery(DEFAULT_ORDERS_LIST_STATE)
  assert.ok(!('status' in query))
})

test('includes a real status filter in the query', () => {
  const query = buildOrdersQuery({ ...DEFAULT_ORDERS_LIST_STATE, status: 'acknowledged' })
  assert.equal(query.status, 'acknowledged')
})

test('sends the same sortField/sortDir for every page of the same view (never drifts page to page)', () => {
  const page1 = buildOrdersQuery({ ...DEFAULT_ORDERS_LIST_STATE, page: 1 })
  const page2 = buildOrdersQuery({ ...DEFAULT_ORDERS_LIST_STATE, page: 2 })
  assert.equal(page1.sortField, page2.sortField)
  assert.equal(page1.sortDir, page2.sortDir)
  assert.notEqual(page1.page, page2.page)
})

// --- sort-key helpers backing the single "Sort by" dropdown.

test('sortKeyFor/sortOptionForKey round-trip for every real sort option', () => {
  for (const field of ['requiredBy', 'assignedAt']) {
    for (const dir of ['asc', 'desc']) {
      const key = sortKeyFor(field, dir)
      const option = sortOptionForKey(key)
      assert.equal(option.sortField, field)
      assert.equal(option.sortDir, dir)
    }
  }
})

test('sortOptionForKey falls back to the first option for an unrecognized key', () => {
  const option = sortOptionForKey('not-a-real-key')
  assert.equal(option.key, sortKeyFor(DEFAULT_ORDERS_LIST_STATE.sortField, DEFAULT_ORDERS_LIST_STATE.sortDir))
})
