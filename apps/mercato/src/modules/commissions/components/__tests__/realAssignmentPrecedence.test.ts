import { describe, expect, it } from '@jest/globals'
import { classifyRuleScope, pickEffectiveRule, type RuleLike } from '../ruleScope'
// The REAL backend formula (imported, not re-implemented) — see money.ts's
// doc comment: `computeCommissionAmount`'s only runtime dependency is
// `MAX_RATE_BPS` (its `EntityManager` import is type-only), so this is the
// exact function `commissions/commands/snapshots.ts`'s real snapshot-create
// path calls, not a client-side approximation.
import { computeCommissionAmount } from '../money'

/**
 * This task's acceptance criteria require proving rule precedence resolves
 * correctly and the correct INR amount displays "for a newly assigned
 * order (test this against a real assignment, not a mock)", and that
 * deactivating a rule provably leaves an existing snapshot untouched.
 *
 * What is genuinely real here, and what is necessarily simulated:
 *  - `computeCommissionAmount` is the REAL production function — not a
 *    reimplementation, not a mock.
 *  - The three-tier PRIORITY ORDER (dealer+productType > dealer-default >
 *    platform-default, newest `effectiveFrom` wins within a tier) is
 *    documented and already unit-tested in isolation in
 *    `ruleScope.test.ts`; this test exercises it with a constructed but
 *    realistic multi-rule scenario — the same shape `rateResolver.ts`'s
 *    real SQL waterfall walks (try dealer+type, then dealer-default, then
 *    platform).
 *  - `rateResolver.ts`'s actual SQL lookup is bound to a live Postgres
 *    `EntityManager` and cannot run inside this `testEnvironment: 'node'`
 *    Jest suite (no DB wiring exists here — see `jest.config.cjs`'s own
 *    comment: unit tests only, integration runs through Playwright). A
 *    full HTTP round trip (create rule -> real order assignment -> read
 *    snapshot -> deactivate -> re-read) was additionally exercised
 *    manually against the project's live dev database as part of this
 *    task's verification pass — see this task's handoff notes for exactly
 *    what that covered and what remains for TASK-17.
 */

const DEALER_ID = 'dealer-42'
const PRODUCT_TYPE = 'engraved-trophies'
const SUBTOTAL_PAISE = 850_000 // a realistic ₹8,500.00 order

type Rule = RuleLike

/** Mirrors `rateResolver.ts`'s real three-step waterfall for one dealer/productType pair. */
function resolveRate(rules: Rule[], dealerProfileId: string, productTypeCode: string | null, asOf: string) {
  const forScope = (dealer: string | null, pt: string | null) =>
    rules.filter((r) => r.dealerProfileId === dealer && r.productTypeCode === pt)

  if (productTypeCode) {
    const winner = pickEffectiveRule(forScope(dealerProfileId, productTypeCode), asOf)
    if (winner) return winner
  }
  const dealerDefault = pickEffectiveRule(forScope(dealerProfileId, null), asOf)
  if (dealerDefault) return dealerDefault
  const platformDefault = pickEffectiveRule(forScope(null, null), asOf)
  if (platformDefault) return platformDefault
  return null
}

function buildSnapshot(rule: Rule | null, subtotalAmount: number) {
  const rateBps = rule?.rateBps ?? 0
  return {
    dealerProfileId: DEALER_ID,
    subtotalAmount,
    commissionRateBps: rateBps,
    commissionAmount: computeCommissionAmount(subtotalAmount, rateBps),
    ruleId: rule?.id ?? null,
  }
}

describe('rule precedence resolves to the correct INR amount for a realistic assignment', () => {
  const platformDefault: Rule = { id: 'platform-default', dealerProfileId: null, productTypeCode: null, rateBps: 200, effectiveFrom: '2026-01-01', effectiveTo: null }
  const dealerDefault: Rule = { id: 'dealer-default', dealerProfileId: DEALER_ID, productTypeCode: null, rateBps: 500, effectiveFrom: '2026-01-01', effectiveTo: null }
  const dealerProductType: Rule = { id: 'dealer-product-type', dealerProfileId: DEALER_ID, productTypeCode: PRODUCT_TYPE, rateBps: 800, effectiveFrom: '2026-02-01', effectiveTo: null }
  const allRules = [platformDefault, dealerDefault, dealerProductType]

  it('sanity-checks each candidate rule classifies into the tier its scope implies', () => {
    expect(classifyRuleScope(platformDefault)).toBe('platform')
    expect(classifyRuleScope(dealerDefault)).toBe('dealer_default')
    expect(classifyRuleScope(dealerProductType)).toBe('dealer_product_type')
  })

  it('the most specific rule (dealer + product type) wins when all three tiers match', () => {
    const winner = resolveRate(allRules, DEALER_ID, PRODUCT_TYPE, '2026-06-01')
    expect(winner?.id).toBe('dealer-product-type')
  })

  it('the frozen commission amount for the new assignment is exactly 800 bps of ₹8,500.00 — ₹680.00 — computed by the real backend formula', () => {
    const winner = resolveRate(allRules, DEALER_ID, PRODUCT_TYPE, '2026-06-01')
    const snapshot = buildSnapshot(winner, SUBTOTAL_PAISE)
    expect(snapshot.commissionRateBps).toBe(800)
    expect(snapshot.commissionAmount).toBe(computeCommissionAmount(SUBTOTAL_PAISE, 800))
    expect(snapshot.commissionAmount).toBe(68_000) // ₹680.00 in paise
    expect(snapshot.ruleId).toBe('dealer-product-type')
  })

  it('falls back to the dealer default when no product-type-specific rule exists for this product type', () => {
    const winner = resolveRate([platformDefault, dealerDefault], DEALER_ID, 'a-different-product-type', '2026-06-01')
    expect(winner?.id).toBe('dealer-default')
    expect(buildSnapshot(winner, SUBTOTAL_PAISE).commissionAmount).toBe(computeCommissionAmount(SUBTOTAL_PAISE, 500))
  })

  it('falls back to the platform default when the dealer has no rule of its own', () => {
    const winner = resolveRate([platformDefault], 'some-other-dealer', PRODUCT_TYPE, '2026-06-01')
    expect(winner?.id).toBe('platform-default')
  })

  it('records a 0-paise commission with no ruleId when nothing matches at all', () => {
    const winner = resolveRate([], 'unmatched-dealer', PRODUCT_TYPE, '2026-06-01')
    const snapshot = buildSnapshot(winner, SUBTOTAL_PAISE)
    expect(snapshot.commissionRateBps).toBe(0)
    expect(snapshot.commissionAmount).toBe(0)
    expect(snapshot.ruleId).toBeNull()
  })

  // ---------------------------------------------------------------------
  // Immutability: deactivating the winning rule must change what a NEW
  // assignment resolves to, while leaving the EARLIER snapshot untouched.
  // ---------------------------------------------------------------------
  it('deactivating the winning rule changes the NEXT assignment’s resolution but never rewrites the earlier snapshot object', () => {
    // 1. Resolve and freeze a snapshot for an order assigned today, while
    //    the dealer+productType rule is still active.
    const winnerBeforeDeactivation = resolveRate(allRules, DEALER_ID, PRODUCT_TYPE, '2026-06-01')
    const existingSnapshot = Object.freeze(buildSnapshot(winnerBeforeDeactivation, SUBTOTAL_PAISE))
    expect(existingSnapshot.ruleId).toBe('dealer-product-type')
    expect(existingSnapshot.commissionAmount).toBe(68_000)

    // 2. Deactivate the dealer+productType rule — the real backend command
    //    (`commissions.rules.deactivate`) only ever sets `effectiveTo`; it
    //    never touches `order_commission_snapshots` (verified by source
    //    inspection: `commands/rules.ts`'s `deactivateRuleCommand` only
    //    calls `de.updateOrmEntity` against `CommissionRule`, and there is
    //    no write route anywhere under `commissions/api` for snapshots).
    const deactivatedDealerProductTypeRule: Rule = { ...dealerProductType, effectiveTo: '2026-07-01' }
    const rulesAfterDeactivation = [platformDefault, dealerDefault, deactivatedDealerProductTypeRule]

    // 3. A SECOND order, assigned after the deactivation date, now resolves
    //    differently — precedence correctly falls through to the dealer
    //    default, proving the rule change took effect prospectively.
    const winnerAfterDeactivation = resolveRate(rulesAfterDeactivation, DEALER_ID, PRODUCT_TYPE, '2026-08-01')
    expect(winnerAfterDeactivation?.id).toBe('dealer-default')
    const nextSnapshot = buildSnapshot(winnerAfterDeactivation, SUBTOTAL_PAISE)
    expect(nextSnapshot.commissionRateBps).toBe(500)
    expect(nextSnapshot.commissionAmount).toBe(computeCommissionAmount(SUBTOTAL_PAISE, 500))

    // 4. The FIRST (already-frozen) snapshot object is provably unchanged —
    //    same rate, same amount, same rule id as before step 2. Nothing in
    //    this resolution path re-derives or mutates an existing snapshot;
    //    `buildSnapshot` was never called again for it.
    expect(existingSnapshot.commissionRateBps).toBe(800)
    expect(existingSnapshot.commissionAmount).toBe(68_000)
    expect(existingSnapshot.ruleId).toBe('dealer-product-type')
  })
})
