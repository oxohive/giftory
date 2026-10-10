import { z } from 'zod'
import { apiRequest } from './http'

/**
 * Gift catalog API — `apps/mercato`'s `gift_catalog` module public storefront routes, called
 * directly (guest-OK):
 *
 *   GET /api/gift_catalog/storefront/occasions
 *     -> { items: [{ code, label, description, imageUrl, sortOrder }] }  (only active ones returned)
 *   GET /api/gift_catalog/storefront/profiles?productIds=<csv,max100>  (or occasion/recipient/customizable)
 *     -> { items: [{ productId, occasions, recipientTypes, isCustomizable, proofRequired,
 *                    giftWrapAvailable, giftMessageMaxLength, productionLeadTimeDays }] }
 *
 * Both routes already respond in camelCase matching the contract below 1:1 (per TASK-04's spec);
 * the wire schemas here are intentionally lenient (optional/nullable) with sensible defaults
 * applied, mirroring `apps/storefront/src/lib/api/gift-catalog.ts`'s DEFAULT_GIFT_PROFILE fallback
 * behavior for products that have no gift profile.
 */

export interface Occasion {
  code: string
  label: string
  description?: string
  imageUrl?: string
  sortOrder: number
}

export interface GiftProfile {
  productId: string
  occasions: string[]
  recipientTypes: string[]
  isCustomizable: boolean
  proofRequired: boolean
  giftWrapAvailable: boolean
  giftMessageMaxLength: number
  productionLeadTimeDays: number
}

const occasionWireSchema = z
  .object({
    code: z.string(),
    label: z.string(),
    description: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    sortOrder: z.number().nullable().optional(),
  })
  .passthrough()

const occasionListWireSchema = z.object({ items: z.array(occasionWireSchema) }).passthrough()

const giftProfileWireSchema = z
  .object({
    productId: z.string(),
    occasions: z.array(z.string()).optional(),
    recipientTypes: z.array(z.string()).optional(),
    isCustomizable: z.boolean().optional(),
    proofRequired: z.boolean().optional(),
    giftWrapAvailable: z.boolean().optional(),
    giftMessageMaxLength: z.number().int().nonnegative().optional(),
    productionLeadTimeDays: z.number().int().nonnegative().optional(),
  })
  .passthrough()

const giftProfileListWireSchema = z.object({ items: z.array(giftProfileWireSchema) }).passthrough()

export async function listOccasions(): Promise<Occasion[]> {
  const res = await apiRequest('/api/gift_catalog/storefront/occasions', occasionListWireSchema)
  return res.items.map((o) => ({
    code: o.code,
    label: o.label,
    description: o.description ?? undefined,
    imageUrl: o.imageUrl ?? undefined,
    sortOrder: o.sortOrder ?? 0,
  }))
}

export async function getGiftProfiles(params: {
  productIds?: string[]
  occasion?: string
  recipient?: string
  customizable?: boolean
}): Promise<GiftProfile[]> {
  const res = await apiRequest('/api/gift_catalog/storefront/profiles', giftProfileListWireSchema, {
    query: {
      productIds: params.productIds?.length ? params.productIds.slice(0, 100).join(',') : undefined,
      occasion: params.occasion,
      recipient: params.recipient,
      customizable: params.customizable,
    },
  })
  return res.items.map((p) => ({
    productId: p.productId,
    occasions: p.occasions ?? [],
    recipientTypes: p.recipientTypes ?? [],
    isCustomizable: p.isCustomizable ?? false,
    proofRequired: p.proofRequired ?? false,
    giftWrapAvailable: p.giftWrapAvailable ?? false,
    giftMessageMaxLength: p.giftMessageMaxLength ?? 250,
    productionLeadTimeDays: p.productionLeadTimeDays ?? 0,
  }))
}
