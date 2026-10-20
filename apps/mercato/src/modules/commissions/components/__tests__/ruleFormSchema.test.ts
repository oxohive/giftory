import { describe, expect, it } from '@jest/globals'
import { commissionRuleClientFormSchema } from '../ruleFormSchema'
import { MAX_RATE_BPS, MIN_RATE_BPS } from '../../lib/constants'

const base = { productTypeCode: '', effectiveFrom: '2026-06-01' }

describe('commissionRuleClientFormSchema', () => {
  it('accepts an empty dealerProfileId (platform-wide rule) — CrudForm sends "" for an unset combobox', () => {
    const result = commissionRuleClientFormSchema.safeParse({ ...base, dealerProfileId: '', rateBps: 250 })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.dealerProfileId).toBeNull()
  })

  it('accepts an empty productTypeCode as null — CrudForm sends "" for an unset text field', () => {
    const result = commissionRuleClientFormSchema.safeParse({ dealerProfileId: '', productTypeCode: '', effectiveFrom: '2026-06-01', rateBps: 250 })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.productTypeCode).toBeNull()
  })

  it('coerces a string rateBps (mid-edit NumberInput value) to a number', () => {
    const result = commissionRuleClientFormSchema.safeParse({ ...base, dealerProfileId: '', rateBps: '250' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.rateBps).toBe(250)
  })

  it('enforces the REAL backend bounds — rejects a rate below MIN_RATE_BPS', () => {
    const result = commissionRuleClientFormSchema.safeParse({ ...base, dealerProfileId: '', rateBps: MIN_RATE_BPS - 1 })
    expect(result.success).toBe(false)
  })

  it('enforces the REAL backend bounds — rejects a rate above MAX_RATE_BPS', () => {
    const result = commissionRuleClientFormSchema.safeParse({ ...base, dealerProfileId: '', rateBps: MAX_RATE_BPS + 1 })
    expect(result.success).toBe(false)
  })

  it('accepts a valid dealer + product type combination', () => {
    const result = commissionRuleClientFormSchema.safeParse({
      dealerProfileId: 'a1b2c3d4-e5f6-4789-8abc-def012345678',
      productTypeCode: 'mugs',
      effectiveFrom: '2026-06-01',
      rateBps: 500,
    })
    expect(result.success).toBe(true)
  })

  it('rejects the unreachable combination — a product type with no dealer selected', () => {
    const result = commissionRuleClientFormSchema.safeParse({
      dealerProfileId: '',
      productTypeCode: 'mugs',
      effectiveFrom: '2026-06-01',
      rateBps: 500,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'productTypeCode')).toBe(true)
    }
  })

  it('still rejects a malformed effectiveFrom via the untouched backend validator', () => {
    const result = commissionRuleClientFormSchema.safeParse({
      dealerProfileId: '',
      productTypeCode: '',
      effectiveFrom: 'not-a-date',
      rateBps: 500,
    })
    expect(result.success).toBe(false)
  })
})
