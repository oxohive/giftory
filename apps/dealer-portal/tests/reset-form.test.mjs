import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildResetConfirmForm, buildResetRequestForm, buildResetValidateForm } from '../src/lib/auth/reset-form.ts'

test('builds form-encoded body for a reset request', () => {
  const body = buildResetRequestForm({ email: 'dealer@example.com' })
  assert.equal(new URLSearchParams(body).get('email'), 'dealer@example.com')
})

test('builds form-encoded body for a token validity check', () => {
  const body = buildResetValidateForm({ token: 'abc123' })
  assert.equal(new URLSearchParams(body).get('token'), 'abc123')
})

test('builds form-encoded body for a reset confirmation', () => {
  const body = buildResetConfirmForm({ token: 'abc123', password: 'newpassword1' })
  const params = new URLSearchParams(body)
  assert.equal(params.get('token'), 'abc123')
  assert.equal(params.get('password'), 'newpassword1')
})

test('never crashes on missing fields', () => {
  assert.doesNotThrow(() => buildResetRequestForm({}))
  assert.doesNotThrow(() => buildResetValidateForm({}))
  assert.doesNotThrow(() => buildResetConfirmForm({}))
})
