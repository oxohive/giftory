/**
 * Client-side mirror of the resolution priority documented in
 * `commissions/data/entities.ts` (`CommissionRule` doc comment) and
 * implemented server-side in `commissions/lib/rateResolver.ts`:
 *
 *   1. dealer_profile_id + product_type_code  (most specific)
 *   2. dealer_profile_id + null               (dealer default)
 *   3. null + null                            (platform-wide default)
 *
 * Within a tier, the resolver picks the matching rule with the latest
 * `effective_from` as of the order's assignment date ("newest wins").
 *
 * `lib/rateResolver.ts`'s actual SQL lookup is DB-bound (raw
 * `em.getConnection().execute(...)`) and cannot run in the browser — this
 * module only replicates the PRIORITY ORDERING for admin-facing transparency
 * (which tier would win, and which existing rule currently occupies a given
 * scope) so the create-rule form can warn about overlaps before saving, per
 * API-CONTRACTS.md: "TASK-15's rule-creation form should at minimum show
 * existing rules for the same dealer/productType scope." It does not
 * duplicate the amount math — `money.ts`'s `previewCommissionAmount` calls
 * the real `computeCommissionAmount` for that.
 */

export type RuleScopeTier = 'platform' | 'dealer_default' | 'dealer_product_type' | 'unreachable_platform_product_type'

export type RuleScopeLike = {
  dealerProfileId: string | null
  productTypeCode: string | null
}

/**
 * Classifies a rule's (dealer, productType) scope into one of the three
 * real resolution tiers, or flags the one combination the resolver never
 * matches: a platform-wide rule (`dealerProfileId: null`) with a
 * `productTypeCode` set. `resolveCommissionRate`'s product-type lookup
 * always queries a specific `dealerProfileId` — it never checks
 * `dealerProfileId IS NULL AND product_type_code = ?` — so such a rule is
 * syntactically valid (the backend schema allows it) but can never win a
 * resolution. The create-rule form uses this to steer admins away from
 * building a dead rule; it is a UI safeguard, not a backend limit.
 */
export function classifyRuleScope(scope: RuleScopeLike): RuleScopeTier {
  if (scope.dealerProfileId == null && scope.productTypeCode) return 'unreachable_platform_product_type'
  if (scope.dealerProfileId == null) return 'platform'
  if (scope.productTypeCode) return 'dealer_product_type'
  return 'dealer_default'
}

/** Higher number = higher resolution priority (dealer+type wins over dealer-default wins over platform). */
export function tierPriority(tier: RuleScopeTier): number {
  switch (tier) {
    case 'dealer_product_type': return 3
    case 'dealer_default': return 2
    case 'platform': return 1
    case 'unreachable_platform_product_type': return 0
  }
}

export type RuleLike = RuleScopeLike & {
  id: string
  rateBps: number
  effectiveFrom: string
  effectiveTo: string | null
}

/**
 * Given the set of rules that match one exact (dealerProfileId,
 * productTypeCode) scope pair, returns the one effective "as of" a given
 * date — the row with the latest `effectiveFrom` that has already started
 * and has not yet ended. Mirrors `rateResolver.ts`'s per-tier SQL
 * (`ORDER BY effective_from DESC LIMIT 1` within the date window) for a
 * single already-fetched tier, purely for the admin-facing overlap preview.
 */
export function pickEffectiveRule(rules: RuleLike[], asOf: string = new Date().toISOString().slice(0, 10)): RuleLike | null {
  const active = rules.filter((r) => r.effectiveFrom <= asOf && (r.effectiveTo == null || r.effectiveTo > asOf))
  if (!active.length) return null
  return active.reduce((best, candidate) => (candidate.effectiveFrom > best.effectiveFrom ? candidate : best))
}
