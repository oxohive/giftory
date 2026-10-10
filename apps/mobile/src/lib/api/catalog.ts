import { z } from 'zod'
import { apiRequest } from './http'

/**
 * Catalog API — calls `apps/mercato`'s `storefront` module facade directly (no BFF proxy on
 * mobile, unlike `apps/storefront`). Guest-OK, 120 req/min/IP.
 *
 *   GET /api/storefront/catalog/products           list (page, pageSize<=100, search, categoryId,
 *                                                   categoryIds, handle, ids csv<=200, minPrice,
 *                                                   maxPrice, occasion, recipient, customizable,
 *                                                   sort, giftOnly)
 *   GET /api/storefront/catalog/products/{handle}   detail (variants[], media[], gift{...})
 *   GET /api/storefront/catalog/categories          active categories
 *
 * Wire field names (snake_case for product/pricing fields) are cross-checked against
 * `apps/storefront/src/lib/api/catalog.schemas.ts`'s `wireProductSchema` / `wirePricingSchema`,
 * which were themselves verified live against this same backend facade. Prices are decimal major
 * units (INR) on the wire — this module does no unit conversion, per TASK-04's "Contracts produced"
 * note (callers use TASK-03's money.ts for display/arithmetic).
 *
 * RESOLVED (was flagged as a known gap in the TASK-04 report, corrected after reading the live
 * `apps/mercato` route source directly): `tax_rate` IS a real field on the wire. The earlier claim
 * that it was missing came from checking `apps/storefront`'s own client-side wire schema, which
 * simply never declares it even though the backend sends it — a gap in the web app's parsing code,
 * not the API. Confirmed against `apps/mercato/src/modules/storefront/lib/catalog.ts`'s
 * `WirePricing`/`toWirePricing()` (snake_case `tax_rate`, sourced from the
 * `catalog_product_variant_prices.tax_rate` column) and against the live `.env`-configured
 * Supabase DB (column exists, populated). `numberOf(wire?.tax_rate)` below correctly surfaces the
 * real value — it only falls back to 0 if the field is genuinely absent, which is not the normal
 * case.
 */

export interface Money {
  currencyCode: string
  amount: number
}

export interface Category {
  id: string
  name: string
  slug: string
  description?: string
  parentId?: string
  depth: number
  isActive: boolean
}

export interface Product {
  id: string
  title: string
  subtitle?: string
  description?: string
  sku: string
  handle: string
  imageUrl?: string
  isConfigurable: boolean
  isActive: boolean
  categories: Category[]
  pricing: { currencyCode: string; unitPriceNet: number; unitPriceGross: number; taxRate: number; kind: string }
}

export interface ProductDetail extends Product {
  variants: Array<{ id: string; title: string; pricing: Product['pricing'] }>
  media: Array<{ id: string; url: string; alt?: string }>
  gift: {
    occasions: string[]
    recipientTypes: string[]
    isCustomizable: boolean
    proofRequired: boolean
    giftWrapAvailable: boolean
    giftMessageMaxLength: number
    productionLeadTimeDays: number
  }
}

export interface ListEnvelope<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  totalIsCapped?: boolean
}

export interface ProductListParams {
  page?: number
  pageSize?: number
  search?: string
  categoryId?: string
  categoryIds?: string[]
  handle?: string
  ids?: string[]
  minPrice?: number
  maxPrice?: number
  occasion?: string
  recipient?: string
  customizable?: boolean
  sort?: 'newest' | 'title' | 'price-asc' | 'price-desc'
  giftOnly?: boolean
}

/* ------------------------------------------------------------------------------------------ */
/* Wire schemas (snake_case for product/pricing fields, cross-checked against the storefront's  */
/* verified wireProductSchema / wirePricingSchema).                                             */
/* ------------------------------------------------------------------------------------------ */

const decimal = z.union([z.number(), z.string()]).nullable().optional()

const wirePricingSchema = z
  .object({
    currency_code: z.string().nullable().optional(),
    unit_price_net: decimal,
    unit_price_gross: decimal,
    // Not present in the storefront's cross-checked schema — see KNOWN GAP note above.
    tax_rate: decimal,
    kind: z.string().nullable().optional(),
  })
  .passthrough()

const wireCategoryRefSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable().optional(),
    slug: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    parentId: z.string().nullable().optional(),
    depth: z.number().nullable().optional(),
    isActive: z.boolean().nullable().optional(),
  })
  .passthrough()

const wireProductSchema = z
  .object({
    id: z.string(),
    title: z.string().nullable().optional(),
    subtitle: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    sku: z.string().nullable().optional(),
    handle: z.string().nullable().optional(),
    default_media_url: z.string().nullable().optional(),
    is_configurable: z.boolean().nullable().optional(),
    is_active: z.boolean().nullable().optional(),
    categories: z.array(wireCategoryRefSchema).optional(),
    pricing: wirePricingSchema.nullable().optional(),
  })
  .passthrough()

const wireVariantSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    sku: z.string().nullable().optional(),
    pricing: wirePricingSchema.nullable().optional(),
  })
  .passthrough()

const wireMediaSchema = z
  .object({
    id: z.string(),
    url: z.string(),
    alt: z.string().nullable().optional(),
  })
  .passthrough()

const wireGiftSchema = z
  .object({
    occasions: z.array(z.string()).optional(),
    recipientTypes: z.array(z.string()).optional(),
    isCustomizable: z.boolean().optional(),
    proofRequired: z.boolean().optional(),
    giftWrapAvailable: z.boolean().optional(),
    giftMessageMaxLength: z.number().optional(),
    productionLeadTimeDays: z.number().optional(),
  })
  .passthrough()

const productListWireSchema = z
  .object({
    items: z.array(wireProductSchema),
    total: z.number().optional(),
    page: z.number().optional(),
    pageSize: z.number().optional(),
    totalPages: z.number().optional(),
    totalIsCapped: z.boolean().optional(),
  })
  .passthrough()

const productDetailEnvelopeWireSchema = z
  .object({
    item: wireProductSchema.extend({
      variants: z.array(wireVariantSchema).optional(),
      media: z.array(wireMediaSchema).optional(),
      gift: wireGiftSchema.optional(),
    }),
  })
  .passthrough()

const categoryListWireSchema = z.object({ items: z.array(wireCategoryRefSchema) }).passthrough()

/* ------------------------------------------------------------------------------------------ */
/* Mapping (wire -> contract)                                                                 */
/* ------------------------------------------------------------------------------------------ */

function numberOf(v: unknown): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

function toPricing(wire: z.infer<typeof wirePricingSchema> | null | undefined): Product['pricing'] {
  return {
    currencyCode: wire?.currency_code ?? 'INR',
    unitPriceNet: numberOf(wire?.unit_price_net),
    unitPriceGross: numberOf(wire?.unit_price_gross),
    taxRate: numberOf(wire?.tax_rate),
    kind: wire?.kind ?? 'regular',
  }
}

/**
 * Inline category refs on a product (`{id,name,slug}`) don't carry `description`/`parentId`/
 * `depth`/`isActive` on the wire — defaulted here (`depth: 0`, `isActive: true`) since the
 * Category contract requires them. Call `listCategories()` for the authoritative values.
 */
function toCategory(wire: z.infer<typeof wireCategoryRefSchema>): Category {
  return {
    id: wire.id,
    name: wire.name ?? '',
    slug: wire.slug ?? wire.id,
    description: wire.description ?? undefined,
    parentId: wire.parentId ?? undefined,
    depth: wire.depth ?? 0,
    isActive: wire.isActive ?? true,
  }
}

function toProduct(wire: z.infer<typeof wireProductSchema>): Product {
  return {
    id: wire.id,
    title: wire.title?.trim() || wire.sku || 'Untitled gift',
    subtitle: wire.subtitle ?? undefined,
    description: wire.description ?? undefined,
    sku: wire.sku ?? '',
    handle: wire.handle?.trim() || wire.id,
    imageUrl: wire.default_media_url ?? undefined,
    isConfigurable: Boolean(wire.is_configurable),
    isActive: wire.is_active ?? true,
    categories: (wire.categories ?? []).map(toCategory),
    pricing: toPricing(wire.pricing),
  }
}

function toProductDetail(wire: z.infer<typeof productDetailEnvelopeWireSchema>['item']): ProductDetail {
  const base = toProduct(wire)
  return {
    ...base,
    variants: (wire.variants ?? []).map((v) => ({
      id: v.id,
      title: v.title?.trim() || v.name?.trim() || v.sku || 'Default',
      pricing: toPricing(v.pricing ?? wire.pricing),
    })),
    media: (wire.media ?? []).map((m) => ({ id: m.id, url: m.url, alt: m.alt ?? undefined })),
    gift: {
      occasions: wire.gift?.occasions ?? [],
      recipientTypes: wire.gift?.recipientTypes ?? [],
      isCustomizable: wire.gift?.isCustomizable ?? base.isConfigurable,
      proofRequired: wire.gift?.proofRequired ?? false,
      giftWrapAvailable: wire.gift?.giftWrapAvailable ?? false,
      giftMessageMaxLength: wire.gift?.giftMessageMaxLength ?? 250,
      productionLeadTimeDays: wire.gift?.productionLeadTimeDays ?? 0,
    },
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Client                                                                                      */
/* ------------------------------------------------------------------------------------------ */

function buildProductQuery(params: ProductListParams) {
  return {
    page: params.page,
    pageSize: params.pageSize,
    search: params.search,
    categoryId: params.categoryId,
    categoryIds: params.categoryIds?.length ? params.categoryIds.join(',') : undefined,
    handle: params.handle,
    ids: params.ids?.length ? params.ids.slice(0, 200).join(',') : undefined,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
    occasion: params.occasion,
    recipient: params.recipient,
    customizable: params.customizable,
    sort: params.sort,
    giftOnly: params.giftOnly,
  }
}

export async function listProducts(params: ProductListParams = {}): Promise<ListEnvelope<Product>> {
  if (params.ids && params.ids.length === 0) {
    return { items: [], total: 0, page: params.page ?? 1, pageSize: params.pageSize ?? 24, totalPages: 0 }
  }
  const res = await apiRequest('/api/storefront/catalog/products', productListWireSchema, {
    query: buildProductQuery(params),
  })
  const items = res.items.map(toProduct)
  return {
    items,
    total: res.total ?? items.length,
    page: res.page ?? params.page ?? 1,
    pageSize: res.pageSize ?? params.pageSize ?? items.length,
    totalPages: res.totalPages ?? 1,
    totalIsCapped: res.totalIsCapped,
  }
}

export async function getProductByHandle(handle: string): Promise<ProductDetail> {
  const res = await apiRequest(
    `/api/storefront/catalog/products/${encodeURIComponent(handle)}`,
    productDetailEnvelopeWireSchema,
  )
  return toProductDetail(res.item)
}

export async function listCategories(): Promise<Category[]> {
  const res = await apiRequest('/api/storefront/catalog/categories', categoryListWireSchema)
  return res.items.filter((c) => c.isActive !== false).map(toCategory)
}
