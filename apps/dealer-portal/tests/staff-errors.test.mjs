import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ApiError } from '@gift/api-client'
import { mapStaffDeactivateError, mapStaffInviteError } from '../src/lib/features/staff/errors.ts'

// The exact real message `throwDuplicateEmailError()` sends (apps/mercato/node_modules/
// @open-mercato/core/src/modules/auth/commands/users.ts), round-tripped through
// `dealerHandler`'s CrudHttpError branch, which forwards status/message but NOT `details`/
// `fieldErrors` for this path (verified by reading apps/mercato/src/modules/dealer_onboarding/
// lib/http.ts directly) — so the real wire-level ApiError for this case has no `details`.
const DUPLICATE_EMAIL_MESSAGE = 'Email already in use'

test('classifies the real duplicate-email 400 (no details on the wire) as duplicate_email', () => {
  const mapped = mapStaffInviteError(new ApiError(400, DUPLICATE_EMAIL_MESSAGE, { code: 'request_failed' }), 'fallback')
  assert.equal(mapped.kind, 'duplicate_email')
  assert.equal(mapped.message, DUPLICATE_EMAIL_MESSAGE)
})

test('a different real 400 (dealer not approved) is NOT misclassified as duplicate_email', () => {
  const mapped = mapStaffInviteError(new ApiError(400, 'Dealer must be approved', { code: 'request_failed' }), 'fallback')
  assert.equal(mapped.kind, 'generic')
  assert.equal(mapped.message, 'Dealer must be approved')
})

test('classifies a 422 as validation and carries details[] through', () => {
  const details = [{ path: 'email', message: 'Invalid email' }]
  const mapped = mapStaffInviteError(new ApiError(422, 'Invalid request', { code: 'invalid_request', details }), 'fallback')
  assert.equal(mapped.kind, 'validation')
  assert.deepEqual(mapped.details, details)
})

test('classifies a 403 as forbidden (dealer:staff lacks dealer_org.manage_staff)', () => {
  const mapped = mapStaffInviteError(
    new ApiError(403, 'You do not have permission to perform this action.', { requiredFeatures: ['dealer_org.manage_staff'] }),
    'fallback',
  )
  assert.equal(mapped.kind, 'forbidden')
})

test('classifies a 404 (no approved profile) as not_found', () => {
  const mapped = mapStaffInviteError(new ApiError(404, 'Dealer not found', { code: 'request_failed' }), 'fallback')
  assert.equal(mapped.kind, 'not_found')
})

test('classifies a 401 as unauthorized', () => {
  const mapped = mapStaffInviteError(new ApiError(401, 'Your session has expired. Please sign in again.'), 'fallback')
  assert.equal(mapped.kind, 'unauthorized')
})

test('classifies a network failure (status 0) as network, not generic', () => {
  const mapped = mapStaffInviteError(new ApiError(0, 'Network error. Please check your connection and try again.'), 'fallback')
  assert.equal(mapped.kind, 'network')
})

test('falls back to generic for a non-ApiError and uses the fallback message', () => {
  const mapped = mapStaffInviteError(new Error('boom'), 'fallback message')
  assert.equal(mapped.kind, 'generic')
  assert.equal(mapped.message, 'fallback message')
})

test('deactivate: the real "Staff user not found" 404 (different org / an owner id / unknown id) is not_found', () => {
  const mapped = mapStaffDeactivateError(new ApiError(404, 'Staff user not found', { code: 'request_failed' }), 'fallback')
  assert.equal(mapped.kind, 'not_found')
})

test('deactivate: the real "cannot deactivate self" 400 still surfaces the real message (defense in depth; unreachable via this app\'s own UI)', () => {
  const mapped = mapStaffDeactivateError(
    new ApiError(400, 'An owner cannot deactivate their own account', { code: 'request_failed' }),
    'fallback',
  )
  assert.equal(mapped.kind, 'generic')
  assert.equal(mapped.message, 'An owner cannot deactivate their own account')
})

test('deactivate: a 403 is forbidden', () => {
  const mapped = mapStaffDeactivateError(new ApiError(403, 'You do not have permission to perform this action.'), 'fallback')
  assert.equal(mapped.kind, 'forbidden')
})
