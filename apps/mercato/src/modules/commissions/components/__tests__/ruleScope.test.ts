import { describe, expect, it } from '@jest/globals'
import { classifyRuleScope, tierPriority, pickEffectiveRule, type RuleLike } from '../ruleScope'

describe('classifyRuleScope', () => {
  it('classifies no dealer + no product type as platform default', () => {
    expect(classifyRuleScope({ dealerProfileId: null, productTypeCode: null })).toBe('platform')
  })

  it('classifies a dealer with no product type as dealer default', () => {
    expect(classifyRuleScope({ dealerProfileId: 'dealer-1', productTypeCode: null })).toBe('dealer_default')
  })

  it('classifies a dealer + product type as the most specific tier', () => {
    expect(classifyRuleScope({ dealerProfileId: 'dealer-1', productTypeCode: 'mugs' })).toBe('dealer_product_type')
  })

  it('flags no-dealer + product-type as the unreachable combination', () => {
    expect(classifyRuleScope({ dealerProfileId: null, productTypeCode: 'mugs' })).toBe('unreachable_platform_product_type')
  })
})

describe('tierPriority', () => {
  it('ranks dealer+productType above dealer default above platform above the unreachable combination', () => {
    expect(tierPriority('dealer_product_type')).toBeGreaterThan(tierPriority('dealer_default'))
    expect(tierPriority('dealer_default')).toBeGreaterThan(tierPriority('platform'))
    expect(tierPriority('platform')).toBeGreaterThan(tierPriority('unreachable_platform_product_type'))
  })
})

function rule(overrides: Partial<RuleLike>): RuleLike {
  return {
    id: 'r1',
    dealerProfileId: null,
    productTypeCode: null,
    rateBps: 100,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    ...overrides,
  }
}

describe('pickEffectiveRule', () => {
  it('returns null when no rules are given', () => {
    expect(pickEffectiveRule([])).toBeNull()
  })

  it('returns the single active rule', () => {
    const r = rule({ id: 'only' })
    expect(pickEffectiveRule([r], '2026-06-01')?.id).toBe('only')
  })

  it('excludes a rule that has not started yet as of the given date', () => {
    const future = rule({ id: 'future', effectiveFrom: '2027-01-01' })
    expect(pickEffectiveRule([future], '2026-06-01')).toBeNull()
  })

  it('excludes a rule that has already ended (effectiveTo in the past relative to "asOf")', () => {
    const ended = rule({ id: 'ended', effectiveFrom: '2025-01-01', effectiveTo: '2025-06-01' })
    expect(pickEffectiveRule([ended], '2026-06-01')).toBeNull()
  })

  it('includes a rule whose effectiveTo is exactly "today" is treated as ended (effectiveTo is exclusive)', () => {
    const endsToday = rule({ id: 'ends-today', effectiveFrom: '2025-01-01', effectiveTo: '2026-06-01' })
    expect(pickEffectiveRule([endsToday], '2026-06-01')).toBeNull()
  })

  it('picks the rule with the latest effectiveFrom among several overlapping active rules — "newest wins"', () => {
    const older = rule({ id: 'older', effectiveFrom: '2026-01-01' })
    const newer = rule({ id: 'newer', effectiveFrom: '2026-03-01' })
    const newest = rule({ id: 'newest', effectiveFrom: '2026-05-01' })
    const result = pickEffectiveRule([older, newest, newer], '2026-06-01')
    expect(result?.id).toBe('newest')
  })

  it('ignores a deactivated rule entirely once its effectiveTo has passed, even if it has the latest effectiveFrom', () => {
    const deactivatedButRecent = rule({ id: 'deactivated', effectiveFrom: '2026-05-01', effectiveTo: '2026-05-15' })
    const stillActiveOlder = rule({ id: 'still-active', effectiveFrom: '2026-01-01' })
    const result = pickEffectiveRule([deactivatedButRecent, stillActiveOlder], '2026-06-01')
    expect(result?.id).toBe('still-active')
  })
})
