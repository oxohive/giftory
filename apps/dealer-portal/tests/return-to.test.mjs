import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeReturnTo } from '../src/lib/auth/return-to.ts'

test('passes through an ordinary same-origin path', () => {
  assert.equal(sanitizeReturnTo('/orders/123'), '/orders/123')
  assert.equal(sanitizeReturnTo('/orders/123?tab=status#note'), '/orders/123?tab=status#note')
})

test('defaults to "/" for missing/empty input', () => {
  assert.equal(sanitizeReturnTo(null), '/')
  assert.equal(sanitizeReturnTo(undefined), '/')
  assert.equal(sanitizeReturnTo(''), '/')
})

test('rejects an absolute URL (open redirect)', () => {
  assert.equal(sanitizeReturnTo('https://evil.example.com/phish'), '/')
  assert.equal(sanitizeReturnTo('http://evil.example.com'), '/')
})

test('rejects a protocol-relative URL', () => {
  assert.equal(sanitizeReturnTo('//evil.example.com/phish'), '/')
})

test('rejects a scheme-looking path segment', () => {
  assert.equal(sanitizeReturnTo('/javascript:alert(1)'), '/')
  assert.equal(sanitizeReturnTo('javascript:alert(1)'), '/')
})

test('rejects backslash variants browsers may normalize to slashes', () => {
  assert.equal(sanitizeReturnTo('/\\evil.example.com'), '/')
  assert.equal(sanitizeReturnTo('\\\\evil.example.com'), '/')
})

test('rejects a path that is not root-relative', () => {
  assert.equal(sanitizeReturnTo('orders/123'), '/')
})

test('rejects double slashes anywhere in the resolved path', () => {
  assert.equal(sanitizeReturnTo('/orders//evil.com'), '/')
})

test('rejects control characters (header-injection defense in depth)', () => {
  assert.equal(sanitizeReturnTo('/orders\r\nSet-Cookie: x=1'), '/')
})

test('rejects an oversized value', () => {
  assert.equal(sanitizeReturnTo('/' + 'a'.repeat(600)), '/')
})

test('honors a custom fallback', () => {
  assert.equal(sanitizeReturnTo('https://evil.com', '/pending'), '/pending')
})
