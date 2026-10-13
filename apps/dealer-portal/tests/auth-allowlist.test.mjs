import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAuthAllowed } from '../src/lib/auth/allowlist.ts'

test('allows the installed password-reset/invite-setup flow', () => {
  assert.equal(isAuthAllowed('auth/reset', 'POST'), true)
  assert.equal(isAuthAllowed('auth/reset/validate', 'POST'), true)
  assert.equal(isAuthAllowed('auth/reset/confirm', 'POST'), true)
})

test('rejects the wrong method on an otherwise-allowed path', () => {
  assert.equal(isAuthAllowed('auth/reset', 'GET'), false)
  assert.equal(isAuthAllowed('auth/reset/confirm', 'PUT'), false)
})

test('rejects path traversal and double-slash attempts', () => {
  assert.equal(isAuthAllowed('../etc/passwd', 'POST'), false)
  assert.equal(isAuthAllowed('auth/reset//confirm', 'POST'), false)
})

test('rejects an unrelated path', () => {
  assert.equal(isAuthAllowed('auth/login', 'POST'), false) // owned by src/lib/http/allowlist.ts, not this one
  assert.equal(isAuthAllowed('dealer_orders/dealer/orders', 'GET'), false)
})
