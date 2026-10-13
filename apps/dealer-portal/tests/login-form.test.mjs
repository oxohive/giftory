import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLoginForm } from '../src/lib/http/login.ts'

test('builds form-encoded body for the shared core-auth login route', () => {
  const body = buildLoginForm({ email: 'owner@example.com', password: 'secret123' })
  const params = new URLSearchParams(body)
  assert.equal(params.get('email'), 'owner@example.com')
  assert.equal(params.get('password'), 'secret123')
  assert.equal(params.has('remember'), false)
  assert.equal(params.has('tenantId'), false)
})

test('includes remember and tenantId only when provided', () => {
  const body = buildLoginForm({ email: 'a@b.com', password: 'x', remember: true, tenantId: 't-1' })
  const params = new URLSearchParams(body)
  assert.equal(params.get('remember'), 'true')
  assert.equal(params.get('tenantId'), 't-1')
})
