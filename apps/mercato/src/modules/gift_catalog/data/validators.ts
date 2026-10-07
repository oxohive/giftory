import { z } from 'zod'
import {
  GIFT_FULFILLMENT_MODES,
  GIFT_OCCASION_CODES,
  GIFT_RECIPIENT_TYPES,
  MAX_GIFT_MESSAGE_LENGTH,
  MAX_PRODUCTION_LEAD_TIME_DAYS,
} from '../lib/constants'

const uuid = () => z.string().uuid()

export const giftOccasionCodeSchema = z.enum(GIFT_OCCASION_CODES)
export const giftRecipientTypeSchema = z.enum(GIFT_RECIPIENT_TYPES)
export const giftFulfillmentModeSchema = z.enum(GIFT_FULFILLMENT_MODES)

/** De-duplicates while keeping the caller's order, so stored arrays stay stable. */
function uniqueList<T extends z.ZodTypeAny>(item: T, max: number) {
  return z
    .array(item)
    .max(max)
    .transform((values) => Array.from(new Set(values)) as Array<z.infer<T>>)
}

const occasionListSchema = uniqueList(giftOccasionCodeSchema, GIFT_OCCASION_CODES.length * 2)
const recipientListSchema = uniqueList(giftRecipientTypeSchema, GIFT_RECIPIENT_TYPES.length * 2)

const nullableTrimmedText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value && value.length > 0 ? value : null))

// ---------------------------------------------------------------------------
// GiftProductProfile
// ---------------------------------------------------------------------------

/**
 * Request-body schemas. They deliberately carry NO `tenantId`/`organizationId`:
 * scope is derived from the authenticated request context only. `z.object`
 * strips unknown keys, so a payload-supplied scope never reaches a command.
 */
export const giftProductProfileCreateSchema = z.object({
  productId: uuid(),
  occasions: occasionListSchema.optional().default([]),
  recipientTypes: recipientListSchema.optional().default([]),
  isCustomizable: z.boolean().optional().default(false),
  proofRequired: z.boolean().optional().default(false),
  giftWrapAvailable: z.boolean().optional().default(false),
  giftMessageMaxLength: z.coerce.number().int().min(0).max(MAX_GIFT_MESSAGE_LENGTH).optional().default(250),
  productionLeadTimeDays: z.coerce.number().int().min(0).max(MAX_PRODUCTION_LEAD_TIME_DAYS).nullable().optional(),
  personalizationNotes: nullableTrimmedText(4000),
  fulfillmentMode: giftFulfillmentModeSchema.optional().default('dealer'),
})

export const giftProductProfileUpdateSchema = z.object({
  id: uuid(),
  occasions: occasionListSchema.optional(),
  recipientTypes: recipientListSchema.optional(),
  isCustomizable: z.boolean().optional(),
  proofRequired: z.boolean().optional(),
  giftWrapAvailable: z.boolean().optional(),
  giftMessageMaxLength: z.coerce.number().int().min(0).max(MAX_GIFT_MESSAGE_LENGTH).optional(),
  productionLeadTimeDays: z.coerce.number().int().min(0).max(MAX_PRODUCTION_LEAD_TIME_DAYS).nullable().optional(),
  personalizationNotes: nullableTrimmedText(4000),
  fulfillmentMode: giftFulfillmentModeSchema.optional(),
})

export const giftProductProfileListSchema = z
  .object({
    id: uuid().optional(),
    ids: z.string().optional(),
    productId: uuid().optional(),
    productIds: z.string().optional(),
    fulfillmentMode: giftFulfillmentModeSchema.optional(),
    isCustomizable: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    sortField: z.enum(['created_at', 'updated_at', 'product_id']).optional().default('updated_at'),
    sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
  })
  .passthrough()

export type GiftProductProfileCreateInput = z.infer<typeof giftProductProfileCreateSchema>
export type GiftProductProfileUpdateInput = z.infer<typeof giftProductProfileUpdateSchema>
export type GiftProductProfileListQuery = z.infer<typeof giftProductProfileListSchema>

// ---------------------------------------------------------------------------
// GiftOccasion
// ---------------------------------------------------------------------------

const occasionCodeInputSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]+$/, 'gift_catalog.validation.codeFormat')
  .min(1)
  .max(64)

const imageUrlSchema = z
  .string()
  .trim()
  .max(1000)
  .refine((value) => value.length === 0 || /^(https?:\/\/|\/)\S+$/.test(value), 'gift_catalog.validation.imageUrl')
  .nullable()
  .optional()
  .transform((value) => (value === undefined ? undefined : value && value.length > 0 ? value : null))

export const giftOccasionCreateSchema = z.object({
  code: occasionCodeInputSchema,
  label: z.string().trim().min(1).max(120),
  description: nullableTrimmedText(1000),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional().default(0),
  isActive: z.boolean().optional().default(true),
  imageUrl: imageUrlSchema,
})

export const giftOccasionUpdateSchema = z.object({
  id: uuid(),
  code: occasionCodeInputSchema.optional(),
  label: z.string().trim().min(1).max(120).optional(),
  description: nullableTrimmedText(1000),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
  imageUrl: imageUrlSchema,
})

export const giftOccasionListSchema = z
  .object({
    id: uuid().optional(),
    ids: z.string().optional(),
    search: z.string().trim().max(120).optional(),
    isActive: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    sortField: z.enum(['sort_order', 'code', 'label', 'created_at', 'updated_at']).optional().default('sort_order'),
    sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
  })
  .passthrough()

export type GiftOccasionCreateInput = z.infer<typeof giftOccasionCreateSchema>
export type GiftOccasionUpdateInput = z.infer<typeof giftOccasionUpdateSchema>
export type GiftOccasionListQuery = z.infer<typeof giftOccasionListSchema>

export const deleteByIdSchema = z.object({ id: uuid() })

// ---------------------------------------------------------------------------
// Public storefront queries
// ---------------------------------------------------------------------------

/**
 * Shop identification for unauthenticated storefront reads. Neither value is
 * trusted as scope: the organization row is looked up server-side and the
 * tenant is always derived from it (or from the custom-domain mapping / the
 * customer session, which take precedence).
 */
const storefrontShopSchema = z.object({
  orgSlug: z.string().trim().min(1).max(150).optional(),
  organizationId: uuid().optional(),
})

export const storefrontOccasionsQuerySchema = storefrontShopSchema.extend({
  locale: z.string().trim().max(16).optional(),
})

export const storefrontProfilesQuerySchema = storefrontShopSchema.extend({
  productIds: z.string().max(4000).optional(),
  occasion: giftOccasionCodeSchema.optional(),
  recipient: giftRecipientTypeSchema.optional(),
  customizable: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export type StorefrontProfilesQuery = z.infer<typeof storefrontProfilesQuerySchema>
