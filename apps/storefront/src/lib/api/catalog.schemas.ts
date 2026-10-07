import { z } from 'zod'

/**
 * Wire schemas for catalog payloads (snake_case, decimal major-unit prices). Served by the backend
 * `storefront` facade (apps/mercato/src/modules/storefront/api/catalog), which mirrors the field
 * names of the native catalog routes (core/dist/modules/catalog/api/{products,variants,prices,categories}).
 * Unknown keys are allowed so backend additions don't break the storefront.
 */
const decimal = z.union([z.number(), z.string()]).nullable().optional()

export const wirePricingSchema = z
  .object({
    currency_code: z.string().nullable().optional(),
    unit_price_net: decimal,
    unit_price_gross: decimal,
    kind: z.string().nullable().optional(),
  })
  .passthrough()

export const wireCategoryRefSchema = z
  .object({ id: z.string(), name: z.string().nullable().optional(), slug: z.string().nullable().optional() })
  .passthrough()

export const wireProductSchema = z
  .object({
    id: z.string(),
    title: z.string().nullable().optional(),
    subtitle: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    sku: z.string().nullable().optional(),
    handle: z.string().nullable().optional(),
    primary_currency_code: z.string().nullable().optional(),
    default_media_url: z.string().nullable().optional(),
    is_configurable: z.boolean().nullable().optional(),
    is_active: z.boolean().nullable().optional(),
    is_quote_only: z.boolean().nullable().optional(),
    requires_shipping: z.boolean().nullable().optional(),
    min_order_qty: z.number().nullable().optional(),
    max_order_qty: z.number().nullable().optional(),
    seo_title: z.string().nullable().optional(),
    seo_description: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    categories: z.array(wireCategoryRefSchema).optional(),
    categoryIds: z.array(z.string()).optional(),
    pricing: wirePricingSchema.nullable().optional(),
  })
  .passthrough()

export const wireVariantSchema = z
  .object({
    id: z.string(),
    product_id: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    sku: z.string().nullable().optional(),
    is_default: z.boolean().nullable().optional(),
    is_active: z.boolean().nullable().optional(),
    option_values: z.record(z.string(), z.unknown()).nullable().optional(),
    default_media_url: z.string().nullable().optional(),
  })
  .passthrough()

export const wirePriceSchema = z
  .object({
    id: z.string(),
    product_id: z.string().nullable().optional(),
    variant_id: z.string().nullable().optional(),
    currency_code: z.string().nullable().optional(),
    kind: z.string().nullable().optional(),
    min_quantity: z.number().nullable().optional(),
    unit_price_net: decimal,
    unit_price_gross: decimal,
    channel_id: z.string().nullable().optional(),
    customer_id: z.string().nullable().optional(),
    customer_group_id: z.string().nullable().optional(),
    user_id: z.string().nullable().optional(),
    user_group_id: z.string().nullable().optional(),
  })
  .passthrough()

export const wireCategorySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    parentId: z.string().nullable().optional(),
    depth: z.number().optional(),
    isActive: z.boolean().optional(),
  })
  .passthrough()

/** Shared paged envelope: { items, total, page?, pageSize?, totalPages } (shared/lib/openapi/crud.js). */
export function pagedSchema<T extends z.ZodTypeAny>(item: T) {
  return z
    .object({
      items: z.array(item),
      total: z.number().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
      totalPages: z.number().optional(),
    })
    .passthrough()
}

/* ------------------------------------------------------------------------------------------ */
/* Storefront domain types (camelCase, integer minor units). Safe for client components.      */
/* ------------------------------------------------------------------------------------------ */

export type ProductSummary = {
  id: string
  slug: string
  title: string
  subtitle: string | null
  imageUrl: string | null
  priceMinor: number | null
  currency: string
  categoryIds: string[]
  isConfigurable: boolean
  isQuoteOnly: boolean
}

export type ProductVariant = {
  id: string
  name: string
  sku: string | null
  isDefault: boolean
  options: Record<string, string>
  imageUrl: string | null
  priceMinor: number | null
}

export type ProductDetail = ProductSummary & {
  description: string | null
  sku: string | null
  seoTitle: string | null
  seoDescription: string | null
  minQty: number
  maxQty: number | null
  categories: { id: string; name: string }[]
  variants: ProductVariant[]
}

export type Category = {
  id: string
  name: string
  slug: string
  parentId: string | null
  depth: number
}

export type ProductListResult = {
  items: ProductSummary[]
  total: number
  page: number
  totalPages: number
}
