import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canDeactivate, isOwner, splitRoster } from '../src/lib/features/staff/roster.ts'

function member(overrides = {}) {
  return {
    id: 'u-1',
    email: 'staff@dealer.in',
    name: 'Staff One',
    role: 'dealer:staff',
    isActive: true,
    lastLoginAt: null,
    createdAt: null,
    ...overrides,
  }
}

test('canDeactivate is true for an active dealer:staff row', () => {
  assert.ok(canDeactivate(member()))
})

test('canDeactivate is false for a dealer:owner row — the caller\'s own role on this owner-only page, and never a valid deactivate target server-side', () => {
  assert.ok(!canDeactivate(member({ role: 'dealer:owner' })))
})

test('canDeactivate is false for an already-deactivated staff row', () => {
  assert.ok(!canDeactivate(member({ isActive: false })))
})

test('isOwner distinguishes role correctly', () => {
  assert.ok(isOwner(member({ role: 'dealer:owner' })))
  assert.ok(!isOwner(member({ role: 'dealer:staff' })))
})

test('splitRoster separates the owner row(s) from the staff rows, preserving staff order', () => {
  const owner = member({ id: 'u-owner', role: 'dealer:owner' })
  const staff1 = member({ id: 'u-staff-1' })
  const staff2 = member({ id: 'u-staff-2' })
  const { owners, staff } = splitRoster([owner, staff1, staff2])
  assert.deepEqual(owners.map((m) => m.id), ['u-owner'])
  assert.deepEqual(staff.map((m) => m.id), ['u-staff-1', 'u-staff-2'])
})

test('splitRoster never throws on zero or multiple owner rows — the real roster endpoint does not guarantee exactly one', () => {
  assert.doesNotThrow(() => splitRoster([]))
  assert.doesNotThrow(() => splitRoster([member({ role: 'dealer:owner' }), member({ id: 'u-2', role: 'dealer:owner' })]))
})
