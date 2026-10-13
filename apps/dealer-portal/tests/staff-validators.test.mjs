import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildInvitePayload,
  mergeFieldErrors,
  validateInviteEmail,
  validateInviteForm,
  validateInviteName,
} from '../src/lib/features/staff/validators.ts'

test('a valid email+name form has no field errors', () => {
  assert.deepEqual(validateInviteForm({ email: 'staff@dealer.in', name: 'Staff One' }), {})
})

test('a valid email with no name has no field errors — name is optional in the real schema', () => {
  assert.deepEqual(validateInviteForm({ email: 'staff@dealer.in', name: '' }), {})
})

test('validateInviteEmail rejects empty, oversized, and malformed values', () => {
  assert.match(validateInviteEmail('') ?? '', /required/i)
  assert.match(validateInviteEmail(`${'a'.repeat(250)}@x.com`) ?? '', /at most 255/)
  assert.match(validateInviteEmail('not-an-email') ?? '', /valid email/i)
  assert.equal(validateInviteEmail('owner@dealer.in'), null)
})

test('validateInviteName allows empty (optional) but rejects an oversized value', () => {
  assert.equal(validateInviteName(''), null)
  assert.equal(validateInviteName('  '), null)
  assert.match(validateInviteName('x'.repeat(256)) ?? '', /at most 255/)
})

test('buildInvitePayload sends only email when name is blank, matching the real .strict() schema', () => {
  const payload = buildInvitePayload({ email: '  staff@dealer.in  ', name: '   ' })
  assert.deepEqual(payload, { email: 'staff@dealer.in' })
})

test('buildInvitePayload includes a trimmed name when provided', () => {
  const payload = buildInvitePayload({ email: 'staff@dealer.in', name: '  Staff One  ' })
  assert.deepEqual(payload, { email: 'staff@dealer.in', name: 'Staff One' })
})

test('buildInvitePayload throws rather than serialize invalid form values', () => {
  assert.throws(() => buildInvitePayload({ email: 'not-an-email', name: '' }))
})

test('mergeFieldErrors lets a real 422 details[] win over a client-side message', () => {
  const merged = mergeFieldErrors({ email: 'client message' }, [{ path: 'email', message: 'server message' }])
  assert.equal(merged.email, 'server message')
})
