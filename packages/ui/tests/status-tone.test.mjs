import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statusLabel, statusTone } from '../src/status-tone.ts'

test('maps every real dealer_onboarding.kycStatus value to a tone', () => {
  assert.equal(statusTone('pending_verification'), 'neutral')
  assert.equal(statusTone('under_review'), 'info')
  assert.equal(statusTone('approved'), 'success')
  assert.equal(statusTone('rejected'), 'danger')
})

test('maps every real dealer_orders assignment status value to a tone', () => {
  assert.equal(statusTone('assigned'), 'info')
  assert.equal(statusTone('acknowledged'), 'info')
  assert.equal(statusTone('in_production'), 'warning')
  assert.equal(statusTone('ready_for_dispatch'), 'warning')
  assert.equal(statusTone('dispatched'), 'success')
  assert.equal(statusTone('cancelled'), 'danger')
})

test('falls back to neutral for an unrecognized status rather than throwing', () => {
  assert.equal(statusTone('some_future_status'), 'neutral')
})

test('statusLabel turns snake_case into words', () => {
  assert.equal(statusLabel('in_production'), 'in production')
  assert.equal(statusLabel('ready_for_dispatch'), 'ready for dispatch')
})
