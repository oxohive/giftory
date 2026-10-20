import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideAccess, resolveDealerAccess } from '../src/lib/auth/access.ts'

// --- resolveDealerAccess: turning raw backend outcomes into a DealerAccessState ---

test('no usable profile (missing/invalid session) resolves to unauthenticated', () => {
  assert.equal(resolveDealerAccess(null, null).kind, 'unauthenticated')
  assert.equal(resolveDealerAccess({ ok: false, roles: [] }, null).kind, 'unauthenticated')
})

test('a valid session without a dealer role resolves to not-a-dealer', () => {
  const state = resolveDealerAccess({ ok: true, roles: ['employee'] }, null)
  assert.equal(state.kind, 'not-a-dealer')
})

test('onboarding 401 (session died between calls) resolves to unauthenticated even with a dealer role', () => {
  const state = resolveDealerAccess({ ok: true, roles: ['dealer:owner'] }, { status: 'unauthorized' })
  assert.equal(state.kind, 'unauthenticated')
})

test('onboarding 404 resolves to no-profile', () => {
  const state = resolveDealerAccess({ ok: true, roles: ['dealer:owner'] }, { status: 'not_found' })
  assert.equal(state.kind, 'no-profile')
})

test('onboarding 403 resolves to not-a-dealer (defensive — the feature grant was missing)', () => {
  const state = resolveDealerAccess({ ok: true, roles: ['dealer:owner'] }, { status: 'forbidden' })
  assert.equal(state.kind, 'not-a-dealer')
})

test('an unreadable/failed onboarding call resolves to error, never approved', () => {
  const state = resolveDealerAccess({ ok: true, roles: ['dealer:owner'] }, { status: 'error' })
  assert.equal(state.kind, 'error')
  assert.equal(resolveDealerAccess({ ok: true, roles: ['dealer:owner'] }, null).kind, 'error')
})

test('approved kycStatus resolves to approved, carrying the resolved role', () => {
  const owner = resolveDealerAccess({ ok: true, roles: ['dealer:owner'] }, { status: 'ok', kycStatus: 'approved' })
  assert.deepEqual(owner, { kind: 'approved', role: 'dealer:owner' })
  const staff = resolveDealerAccess({ ok: true, roles: ['dealer:staff'] }, { status: 'ok', kycStatus: 'approved' })
  assert.deepEqual(staff, { kind: 'approved', role: 'dealer:staff' })
})

test('an owner outranks a staff role when (hypothetically) both are present', () => {
  const state = resolveDealerAccess({ ok: true, roles: ['dealer:staff', 'dealer:owner'] }, { status: 'ok', kycStatus: 'approved' })
  assert.equal(state.role, 'dealer:owner')
})

test('pending_verification / under_review both resolve to pending, carrying the real sub-status', () => {
  const pv = resolveDealerAccess({ ok: true, roles: ['dealer:owner'] }, { status: 'ok', kycStatus: 'pending_verification' })
  assert.deepEqual(pv, { kind: 'pending', role: 'dealer:owner', kycStatus: 'pending_verification' })
  const ur = resolveDealerAccess({ ok: true, roles: ['dealer:owner'] }, { status: 'ok', kycStatus: 'under_review' })
  assert.deepEqual(ur, { kind: 'pending', role: 'dealer:owner', kycStatus: 'under_review' })
})

test('rejected carries the rejection reason through unchanged', () => {
  const state = resolveDealerAccess(
    { ok: true, roles: ['dealer:owner'] },
    { status: 'ok', kycStatus: 'rejected', rejectionReason: 'Invalid GSTIN' },
  )
  assert.deepEqual(state, { kind: 'rejected', role: 'dealer:owner', rejectionReason: 'Invalid GSTIN' })
})

test('rejected with no reason on record is null, not a placeholder string', () => {
  const state = resolveDealerAccess({ ok: true, roles: ['dealer:owner'] }, { status: 'ok', kycStatus: 'rejected' })
  assert.equal(state.rejectionReason, null)
})

// --- decideAccess: turning a DealerAccessState into an allow/redirect decision ---

test('unauthenticated redirects to /login with no query string by default', () => {
  assert.deepEqual(decideAccess({ kind: 'unauthenticated' }), { allow: false, redirectTo: '/login' })
})

test('unauthenticated with a reason adds ?reason=... ', () => {
  const decision = decideAccess({ kind: 'unauthenticated', reason: 'expired' })
  assert.equal(decision.allow, false)
  assert.equal(decision.redirectTo, '/login?reason=expired')
})

test('unauthenticated with a non-root returnTo adds ?returnTo=... (sanitized upstream, forwarded verbatim)', () => {
  const decision = decideAccess({ kind: 'unauthenticated' }, { returnTo: '/orders/123' })
  assert.equal(decision.redirectTo, '/login?returnTo=%2Forders%2F123')
})

test('unauthenticated never adds ?returnTo= for the root path (nothing to remember)', () => {
  const decision = decideAccess({ kind: 'unauthenticated' }, { returnTo: '/' })
  assert.equal(decision.redirectTo, '/login')
})

test('error state fails closed — redirected to login, never treated as approved', () => {
  const decision = decideAccess({ kind: 'error' })
  assert.equal(decision.allow, false)
  assert.equal(decision.redirectTo, '/login?reason=unavailable')
})

test('not-a-dealer and no-profile route to access-denied with a distinct reason each', () => {
  assert.equal(decideAccess({ kind: 'not-a-dealer' }).redirectTo, '/access-denied?reason=not-a-dealer')
  assert.equal(decideAccess({ kind: 'no-profile' }).redirectTo, '/access-denied?reason=no-profile')
})

test('pending and rejected both route to the holding page, not a generic error', () => {
  assert.equal(
    decideAccess({ kind: 'pending', role: 'dealer:owner', kycStatus: 'under_review' }).redirectTo,
    '/pending',
  )
  assert.equal(
    decideAccess({ kind: 'rejected', role: 'dealer:owner', rejectionReason: null }).redirectTo,
    '/pending',
  )
})

test('approved with no role restriction is allowed, carrying the resolved role', () => {
  const decision = decideAccess({ kind: 'approved', role: 'dealer:staff' })
  assert.deepEqual(decision, { allow: true, role: 'dealer:staff' })
})

test('approved owner passes an owner-only gate', () => {
  const decision = decideAccess({ kind: 'approved', role: 'dealer:owner' }, { requireRole: ['dealer:owner'] })
  assert.equal(decision.allow, true)
})

test('approved staff is blocked server-side from an owner-only gate — redirected to /forbidden, not silently shown', () => {
  const decision = decideAccess({ kind: 'approved', role: 'dealer:staff' }, { requireRole: ['dealer:owner'] })
  assert.deepEqual(decision, { allow: false, redirectTo: '/forbidden' })
})
