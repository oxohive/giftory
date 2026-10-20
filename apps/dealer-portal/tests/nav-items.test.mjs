import { test } from 'node:test'
import assert from 'node:assert/strict'
import { visibleNavItems } from '../src/components/layout/nav-items.ts'

test('an owner sees every nav entry, including Staff and Earnings', () => {
  const hrefs = visibleNavItems('dealer:owner').map((item) => item.href)
  assert.deepEqual(hrefs, ['/', '/orders', '/profile', '/staff', '/earnings'])
})

test('staff never see Staff or Earnings (FEAT-009: no staff financial/staff-management access)', () => {
  const hrefs = visibleNavItems('dealer:staff').map((item) => item.href)
  assert.deepEqual(hrefs, ['/', '/orders', '/profile'])
})

test('shows every entry while the session has not resolved yet, rather than hiding links', () => {
  assert.equal(visibleNavItems(null).length, 5)
  assert.equal(visibleNavItems(undefined).length, 5)
})
