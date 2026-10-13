import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isTrustedOrigin } from '../src/lib/auth/csrf.ts'

const SELF = 'https://dealer-portal.example.com'

test('trusts a request with no Origin header (same-origin browsers may omit it)', () => {
  assert.equal(isTrustedOrigin(null, SELF), true)
  assert.equal(isTrustedOrigin(undefined, SELF), true)
})

test('trusts a request whose Origin matches this app', () => {
  assert.equal(isTrustedOrigin(SELF, SELF), true)
})

test('rejects a cross-site Origin', () => {
  assert.equal(isTrustedOrigin('https://evil.example.com', SELF), false)
})

test('rejects a same-host Origin with a different scheme (downgrade attempt)', () => {
  assert.equal(isTrustedOrigin('http://dealer-portal.example.com', SELF), false)
})
