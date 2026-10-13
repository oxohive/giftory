import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAllowed } from '../src/lib/http/allowlist.ts'

test('allows every dealer-facing route verified in tasks/phase-2-ui/API-CONTRACTS.md', () => {
  const cases = [
    ['auth/login', 'POST'],
    ['auth/logout', 'POST'],
    ['auth/session/refresh', 'POST'],
    ['auth/profile', 'GET'],
    ['dealer_onboarding/dealer/onboarding/register', 'POST'],
    ['dealer_onboarding/dealer/onboarding/status', 'GET'],
    ['dealer_onboarding/dealer/onboarding/documents', 'POST'],
    ['dealer_onboarding/dealer/onboarding/resubmit', 'POST'],
    ['dealer_org_rbac/dealer/profile', 'GET'],
    ['dealer_org_rbac/dealer/profile/capabilities', 'PUT'],
    ['dealer_org_rbac/dealer/staff/invite', 'POST'],
    ['dealer_orders/dealer/orders', 'GET'],
    ['dealer_orders/dealer/orders/9f1c6c2e-6c0a-4e2a-9b1e-1f2a3b4c5d6e', 'GET'],
    ['dealer_orders/dealer/orders/9f1c6c2e-6c0a-4e2a-9b1e-1f2a3b4c5d6e/status', 'POST'],
    ['commissions/dealer/earnings', 'GET'],
    ['commissions/dealer/earnings/9f1c6c2e-6c0a-4e2a-9b1e-1f2a3b4c5d6e', 'GET'],
    ['payouts/dealer/ledger', 'GET'],
    ['payouts/dealer/ledger/balance', 'GET'],
  ]
  for (const [path, method] of cases) {
    assert.ok(isAllowed(path, method), `expected ${method} ${path} to be allowed`)
  }
})

test('rejects admin routes — admin screens live in apps/mercato, never proxied here', () => {
  assert.equal(isAllowed('dealer_orders/admin/orders/1/assignment', 'POST'), false)
  assert.equal(isAllowed('dealer_onboarding/admin/dealers/applications', 'GET'), false)
  assert.equal(isAllowed('commissions/admin/commission/rules', 'GET'), false)
})

test('rejects a documented path with the wrong method', () => {
  assert.equal(isAllowed('dealer_orders/dealer/orders', 'POST'), false)
  assert.equal(isAllowed('dealer_org_rbac/dealer/profile/capabilities', 'GET'), false)
})

test('rejects path traversal and double-slash attempts regardless of the method', () => {
  assert.equal(isAllowed('../etc/passwd', 'GET'), false)
  assert.equal(isAllowed('dealer_orders/dealer//orders', 'GET'), false)
})

test('rejects an unlisted module', () => {
  assert.equal(isAllowed('storefront/checkout/orders', 'POST'), false)
})
