import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldInterceptNavigation } from '../src/lib/features/profile/navigationGuard.ts'

const ORIGIN = 'https://portal.example.com'
const PLAIN = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }

test('intercepts a plain same-origin, same-tab click', () => {
  assert.ok(shouldInterceptNavigation('/orders', ORIGIN, null, PLAIN))
  assert.ok(shouldInterceptNavigation(`${ORIGIN}/staff`, ORIGIN, undefined, PLAIN))
})

test('does not intercept a modified click (ctrl/cmd/shift/alt) — the user is opening a new tab, not losing this one', () => {
  for (const key of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
    assert.equal(shouldInterceptNavigation('/orders', ORIGIN, null, { ...PLAIN, [key]: true }), false, key)
  }
})

test('does not intercept a middle/right click (button !== 0)', () => {
  assert.equal(shouldInterceptNavigation('/orders', ORIGIN, null, { ...PLAIN, button: 1 }), false)
})

test('does not intercept a target="_blank" link', () => {
  assert.equal(shouldInterceptNavigation('/orders', ORIGIN, '_blank', PLAIN), false)
})

test('intercepts target="_self" (the default) the same as no target', () => {
  assert.ok(shouldInterceptNavigation('/orders', ORIGIN, '_self', PLAIN))
})

test('does not intercept a cross-origin link', () => {
  assert.equal(shouldInterceptNavigation('https://support.example.com/contact', ORIGIN, null, PLAIN), false)
})

test('does not intercept an unparseable href rather than throwing', () => {
  assert.equal(shouldInterceptNavigation('not a url and not a path???', 'not-an-origin', null, PLAIN), false)
})
