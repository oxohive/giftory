import { describe, expect, it } from '@jest/globals'
import {
  giftOccasionCreateSchema,
  giftProductProfileCreateSchema,
  giftProductProfileUpdateSchema,
  storefrontProfilesQuerySchema,
} from '../data/validators'
import { toStringArray, transformProfileRow, type ProfileRow } from '../lib/profileRows'
import { DEFAULT_GIFT_OCCASIONS, GIFT_OCCASION_CODES } from '../lib/constants'

const PRODUCT_ID = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b'
const OTHER_TENANT = '11111111-2222-4333-8444-555555555555'

describe('gift_catalog request schemas', () => {
  it('strips payload-supplied tenant and organization scope', () => {
    const parsed = giftProductProfileCreateSchema.parse({
      productId: PRODUCT_ID,
      tenantId: OTHER_TENANT,
      organizationId: OTHER_TENANT,
    }) as Record<string, unknown>
    expect(parsed.tenantId).toBeUndefined()
    expect(parsed.organizationId).toBeUndefined()
  })

  it('applies documented defaults on create', () => {
    const parsed = giftProductProfileCreateSchema.parse({ productId: PRODUCT_ID })
    expect(parsed).toMatchObject({
      occasions: [],
      recipientTypes: [],
      isCustomizable: false,
      proofRequired: false,
      giftWrapAvailable: false,
      giftMessageMaxLength: 250,
      fulfillmentMode: 'dealer',
    })
  })

  it('de-duplicates vocabularies and rejects unknown codes', () => {
    const parsed = giftProductProfileCreateSchema.parse({
      productId: PRODUCT_ID,
      occasions: ['birthday', 'birthday', 'wedding'],
    })
    expect(parsed.occasions).toEqual(['birthday', 'wedding'])
    expect(giftProductProfileCreateSchema.safeParse({ productId: PRODUCT_ID, occasions: ['halloween'] }).success).toBe(false)
    expect(giftProductProfileCreateSchema.safeParse({ productId: PRODUCT_ID, recipientTypes: ['pets'] }).success).toBe(false)
  })

  it('keeps omitted update fields undefined and clears notes to null', () => {
    const parsed = giftProductProfileUpdateSchema.parse({ id: PRODUCT_ID, personalizationNotes: '   ' })
    expect(parsed.occasions).toBeUndefined()
    expect(parsed.personalizationNotes).toBeNull()
    expect(parsed.productionLeadTimeDays).toBeUndefined()
  })

  it('normalizes occasion codes', () => {
    expect(giftOccasionCreateSchema.parse({ code: ' Birthday ', label: 'Birthday' }).code).toBe('birthday')
    expect(giftOccasionCreateSchema.safeParse({ code: 'bad code', label: 'x' }).success).toBe(false)
  })

  it('validates storefront filters', () => {
    expect(storefrontProfilesQuerySchema.safeParse({ orgSlug: 'shop', occasion: 'birthday' }).success).toBe(true)
    expect(storefrontProfilesQuerySchema.safeParse({ orgSlug: 'shop', occasion: 'nope' }).success).toBe(false)
    expect(storefrontProfilesQuerySchema.safeParse({ organizationId: 'not-a-uuid' }).success).toBe(false)
  })
})

describe('gift_catalog row transforms', () => {
  it('parses postgres array literals and serializes updatedAt', () => {
    expect(toStringArray('{birthday,wedding}')).toEqual(['birthday', 'wedding'])
    expect(toStringArray('{}')).toEqual([])
    const row: ProfileRow = {
      id: 'p1',
      product_id: PRODUCT_ID,
      occasions: ['birthday'],
      recipient_types: '{her}',
      is_customizable: true,
      proof_required: false,
      gift_wrap_available: true,
      gift_message_max_length: 120,
      production_lead_time_days: null,
      personalization_notes: null,
      fulfillment_mode: 'platform',
      tenant_id: null,
      organization_id: null,
      created_at: null,
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
    }
    expect(transformProfileRow(row)).toMatchObject({
      productId: PRODUCT_ID,
      occasions: ['birthday'],
      recipientTypes: ['her'],
      fulfillmentMode: 'platform',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
  })

  it('seeds one default occasion per vocabulary code', () => {
    expect(DEFAULT_GIFT_OCCASIONS.map((entry) => entry.code).sort()).toEqual([...GIFT_OCCASION_CODES].sort())
  })
})
