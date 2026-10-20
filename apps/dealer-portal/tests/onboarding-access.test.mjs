import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideOnboardingAccess, resubmitRedirectFor } from '../src/lib/features/onboarding/access.ts'

/**
 * `decideOnboardingAccess`/`resubmitRedirectFor` are pure — exercised here with the exact same
 * `DealerAccessState` shape TASK-04's own tests/access.test.mjs constructs (real contract
 * fixtures: unauthenticated/not-a-dealer/no-profile/pending/rejected/approved/error), not a
 * re-assertion of this file's own implementation. The key property under test: these onboarding
 * screens must stay reachable for exactly the states `@/lib/auth/access.ts`'s `decideAccess`
 * sends to `/pending` instead (pending/rejected), while every other state still fails closed the
 * same way the rest of the app does.
 */

test('unauthenticated redirects to login with a returnTo back to the onboarding page', () => {
  const decision = decideOnboardingAccess({ kind: 'unauthenticated' }, '/onboarding/status')
  assert.deepEqual(decision, { allow: false, redirectTo: '/login?returnTo=%2Fonboarding%2Fstatus' })
})

test('error state fails closed to login, never treated as any onboarding state', () => {
  const decision = decideOnboardingAccess({ kind: 'error' }, '/onboarding/status')
  assert.equal(decision.allow, false)
  assert.ok(decision.redirectTo.startsWith('/login'))
})

test('not-a-dealer and no-profile route to access-denied, same as the rest of the app', () => {
  assert.deepEqual(decideOnboardingAccess({ kind: 'not-a-dealer' }, '/onboarding/status'), {
    allow: false,
    redirectTo: '/access-denied?reason=not-a-dealer',
  })
  assert.deepEqual(decideOnboardingAccess({ kind: 'no-profile' }, '/onboarding/status'), {
    allow: false,
    redirectTo: '/access-denied?reason=no-profile',
  })
})

test('pending is ALLOWED here (unlike guard.ts/decideAccess, which sends it to /pending)', () => {
  const decision = decideOnboardingAccess(
    { kind: 'pending', role: 'dealer:owner', kycStatus: 'under_review' },
    '/onboarding/status',
  )
  assert.deepEqual(decision, { allow: true, access: { kind: 'pending', kycStatus: 'under_review' } })
})

test('rejected is ALLOWED here and carries the rejection reason through', () => {
  const decision = decideOnboardingAccess(
    { kind: 'rejected', role: 'dealer:owner', rejectionReason: 'Invalid GSTIN' },
    '/onboarding/resubmit',
  )
  assert.deepEqual(decision, { allow: true, access: { kind: 'rejected', rejectionReason: 'Invalid GSTIN' } })
})

test('rejected with no reason on record carries null through, not a placeholder string', () => {
  const decision = decideOnboardingAccess({ kind: 'rejected', role: 'dealer:owner', rejectionReason: null }, '/x')
  assert.equal(decision.allow, true)
  assert.equal(decision.access.rejectionReason, null)
})

test('approved is allowed too (an approved dealer can still view their own submitted details)', () => {
  const decision = decideOnboardingAccess({ kind: 'approved', role: 'dealer:owner' }, '/onboarding/status')
  assert.deepEqual(decision, { allow: true, access: { kind: 'approved' } })
})

test('returnTo of "/" never appears in the login redirect query string', () => {
  const decision = decideOnboardingAccess({ kind: 'unauthenticated' }, '/')
  assert.equal(decision.redirectTo, '/login')
})

// --- resubmitRedirectFor: only a rejected caller should ever see the resubmit form ---

test('resubmitRedirectFor allows a rejected caller through (returns null = no redirect)', () => {
  assert.equal(resubmitRedirectFor({ kind: 'rejected', rejectionReason: null }), null)
})

test('resubmitRedirectFor sends a pending caller to the status page instead', () => {
  assert.equal(resubmitRedirectFor({ kind: 'pending', kycStatus: 'pending_verification' }), '/onboarding/status')
})

test('resubmitRedirectFor sends an approved caller to the dashboard instead', () => {
  assert.equal(resubmitRedirectFor({ kind: 'approved' }), '/')
})
