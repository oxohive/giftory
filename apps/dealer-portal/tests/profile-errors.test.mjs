import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ApiError } from '@gift/api-client'
import { mapCapabilitiesSaveError } from '../src/lib/features/profile/errors.ts'

test('classifies a 409 as a conflict (optimistic-concurrency, capabilities PUT)', () => {
  const mapped = mapCapabilitiesSaveError(
    new ApiError(409, 'Capabilities were updated by someone else; reload and try again', { code: 'request_failed' }),
    'fallback',
  )
  assert.equal(mapped.kind, 'conflict')
})

test('classifies a 422 as validation and carries details[] through', () => {
  const details = [{ path: 'printingMethods', message: 'Invalid enum value' }]
  const mapped = mapCapabilitiesSaveError(
    new ApiError(422, 'Invalid request', { code: 'invalid_request', details }),
    'fallback',
  )
  assert.equal(mapped.kind, 'validation')
  assert.deepEqual(mapped.details, details)
})

test('classifies a 403 as forbidden (dealer:staff lacks dealer_org.manage_capabilities)', () => {
  const mapped = mapCapabilitiesSaveError(
    new ApiError(403, 'You do not have permission to perform this action.', { requiredFeatures: ['dealer_org.manage_capabilities'] }),
    'fallback',
  )
  assert.equal(mapped.kind, 'forbidden')
})

test('classifies a 404 (no approved profile) as not_found', () => {
  const mapped = mapCapabilitiesSaveError(new ApiError(404, 'Dealer not found', { code: 'request_failed' }), 'fallback')
  assert.equal(mapped.kind, 'not_found')
})

test('classifies a network failure (status 0) as network, not generic', () => {
  const mapped = mapCapabilitiesSaveError(new ApiError(0, 'Network error. Please check your connection and try again.'), 'fallback')
  assert.equal(mapped.kind, 'network')
})

test('falls back to generic for a non-ApiError and uses the fallback message', () => {
  const mapped = mapCapabilitiesSaveError(new Error('boom'), 'fallback message')
  assert.equal(mapped.kind, 'generic')
  assert.equal(mapped.message, 'fallback message')
})

test('an unrecognized ApiError status still falls back to generic, using the real message', () => {
  const mapped = mapCapabilitiesSaveError(new ApiError(500, 'Something broke'), 'fallback')
  assert.equal(mapped.kind, 'generic')
  assert.equal(mapped.message, 'Something broke')
})
