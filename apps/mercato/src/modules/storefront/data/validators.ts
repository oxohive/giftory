import { z } from 'zod'
import { GIFT_OCCASION_CODES, GIFT_RECIPIENT_TYPES } from '../../gift_catalog/lib/constants'
import { GIFT_MESSAGE_HARD_LIMIT, MAX_CART_LINES, MAX_LINE_QUANTITY, PAYMENT_PROVIDERS, STOREFRONT_CURRENCY } from '../lib/constants'

/**
 * Request schemas. None of them carries `tenantId`: scope is resolved
 * server-side (custom-domain host → customer session → shop identifier) and
 * `z.object` strips unknown keys, so payload scope never reaches a handler.
 */

const uuid = () => z.string().uuid()

/** Shop identifier for anonymous calls on platform domains (never trusted as scope). */
export const shopIdentifierSchema = z.object({
  orgSlug: z.string().trim().min(1).max(150).optional(),
  organizationId: uuid().optional(),
})
export type ShopIdentifier = z.infer<typeof shopIdentifierSchema>

const nonNegativeMajor = z.coerce.number().min(0).max(10_000_000)

export const catalogProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
  search: z.string().trim().max(120).optional(),
  categoryId: uuid().optional(),
  /** Comma-separated category ids (max 50). Sub-categories are included. */
  categoryIds: z.string().max(2000).optional(),
  handle: z.string().trim().min(1).max(200).optional(),
  /** Comma-separated product ids (max 200). */
  ids: z.string().max(8000).optional(),
  minPrice: nonNegativeMajor.optional(),
  maxPrice: nonNegativeMajor.optional(),
  occasion: z.enum(GIFT_OCCASION_CODES).optional(),
  recipient: z.enum(GIFT_RECIPIENT_TYPES).optional(),
  customizable: z.enum(['true', 'false']).optional(),
  /** When 'true', restricts results to products that have a gift profile. */
  giftOnly: z.enum(['true', 'false']).optional(),
  sort: z.enum(['newest', 'title', 'price-asc', 'price-desc']).default('newest'),
})
export type CatalogProductsQuery = z.infer<typeof catalogProductsQuerySchema>

const giftMessageSchema = z
  .string()
  .max(GIFT_MESSAGE_HARD_LIMIT * 2)
  .nullable()
  .optional()

export const cartLineInputSchema = z.object({
  productId: uuid(),
  variantId: uuid().nullable().optional(),
  quantity: z.coerce.number().int().min(1).max(MAX_LINE_QUANTITY),
  giftWrap: z.boolean().optional().default(false),
  giftMessage: giftMessageSchema,
})
export type CartLineInput = z.infer<typeof cartLineInputSchema>

export const cartReplaceSchema = z.object({
  lines: z.array(cartLineInputSchema).max(MAX_CART_LINES),
})

export const cartLineUpdateSchema = z
  .object({
    quantity: z.coerce.number().int().min(1).max(MAX_LINE_QUANTITY).optional(),
    giftWrap: z.boolean().optional(),
    giftMessage: giftMessageSchema,
  })
  .refine((value) => value.quantity !== undefined || value.giftWrap !== undefined || value.giftMessage !== undefined, {
    message: 'Provide quantity, giftWrap or giftMessage',
  })
export type CartLineUpdate = z.infer<typeof cartLineUpdateSchema>

/** Mirrors the storefront's `addressSchema` (src/lib/api/addresses.ts). */
export const addressFieldsSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^(\+91[\s-]?)?[6-9]\d{9}$/),
  line1: z.string().trim().min(3).max(200),
  line2: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().regex(/^[1-9]\d{5}$/),
  country: z.literal('IN'),
})
export type AddressFields = z.infer<typeof addressFieldsSchema>

export const addressCreateSchema = addressFieldsSchema.extend({ isDefault: z.boolean().optional() })
export const addressUpdateSchema = addressFieldsSchema.partial().extend({ isDefault: z.boolean().optional() })

const returnUrlSchema = z.string().trim().min(1).max(2000)

export const placeOrderSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  currencyCode: z.literal(STOREFRONT_CURRENCY).optional().default(STOREFRONT_CURRENCY),
  /** Omit to check out the shopper's server-side cart. */
  lines: z.array(cartLineInputSchema).min(1).max(MAX_CART_LINES).optional(),
  shippingAddress: addressFieldsSchema,
  billingAddress: addressFieldsSchema.nullable().optional(),
  billingSameAsShipping: z.boolean().optional().default(true),
  shippingMethodCode: z.string().trim().min(1).max(120),
  paymentProvider: z.enum(PAYMENT_PROVIDERS),
  successUrl: returnUrlSchema,
  cancelUrl: returnUrlSchema,
})
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>

export const paymentSessionRetrySchema = z.object({
  paymentProvider: z.enum(PAYMENT_PROVIDERS),
  successUrl: returnUrlSchema,
  cancelUrl: returnUrlSchema,
})
export type PaymentSessionRetryInput = z.infer<typeof paymentSessionRetrySchema>

export const shippingMethodsQuerySchema = z.object({
  /** Cart subtotal in major units; ignored when the shopper has a server cart. */
  subtotal: nonNegativeMajor.optional(),
  itemCount: z.coerce.number().int().min(1).max(MAX_CART_LINES * MAX_LINE_QUANTITY).optional(),
  postalCode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/)
    .optional(),
})

export const ordersListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})
