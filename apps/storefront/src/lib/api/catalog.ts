import 'server-only'
import { z } from 'zod'
import { publicEnv } from '@/lib/env.public'
import { toMinorUnits } from '@/lib/money'
import { slugify } from '@/lib/utils'
import {
  pagedSchema,
  wireCategorySchema,
  wirePricingSchema,
  wireProductSchema,
  wireVariantSchema,
  type Category,
  type ProductDetail,
  type ProductListResult,
  type ProductSummary,
  type ProductVariant,
} from './catalog.schemas'
import { ApiError } from './http'
import { serverRequest } from './server-http'

/**
 * Catalog API (server-only), served by the backend `storefront` module's public facade
 * (apps/mercato/src/modules/storefront, GAP G1/G6 closed):
 *
 *   GET /api/storefront/catalog/products           list (search, categoryId, ids, handle, minPrice/maxPrice,
 *                                                  occasion, recipient, sort=newest|title|price-asc|price-desc)
 *   GET /api/storefront/catalog/products/{slug}    detail by handle or id (variants with prices, media, gift profile)
 *   GET /api/storefront/catalog/categories         active categories
 *
 * No staff API key is needed any more: the routes are public, rate limited, and resolve the shop
 * from `organizationId`/`orgSlug` (added by `withShop`). Prices are INR `regular` list prices in
 * decimal major units; `pricing` on a product is the lowest price of its active variants.
 * See docs/backend-api-contract.md section 2.
 */

const CATALOG_REVALIDATE_SECONDS = 120

type WireProduct = z.infer<typeof wireProductSchema>

export function absoluteMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return `${publicEnv.apiBaseUrl}${url.startsWith('/') ? '' : '/'}${url}`
}

function productSlug(product: WireProduct): string {
  const handle = product.handle?.trim()
  return handle ? handle : product.id
}

function priceOf(pricing: z.infer<typeof wirePricingSchema> | null | undefined): number | null {
  return toMinorUnits(pricing?.unit_price_gross ?? pricing?.unit_price_net ?? null)
}

function toSummary(product: WireProduct): ProductSummary {
  const pricing = product.pricing ?? null
  return {
    id: product.id,
    slug: productSlug(product),
    title: product.title?.trim() || product.sku || 'Untitled gift',
    subtitle: product.subtitle ?? null,
    imageUrl: absoluteMediaUrl(product.default_media_url),
    priceMinor: priceOf(pricing),
    currency: (pricing?.currency_code ?? product.primary_currency_code ?? publicEnv.currency).toUpperCase(),
    categoryIds: product.categoryIds ?? product.categories?.map((c) => c.id) ?? [],
    isConfigurable: Boolean(product.is_configurable),
    isQuoteOnly: Boolean(product.is_quote_only),
  }
}

export type ProductSort = 'newest' | 'title' | 'price-asc' | 'price-desc'

export type ProductQuery = {
  search?: string
  categoryId?: string
  /** Restrict to these product ids (max 200). */
  ids?: string[]
  page?: number
  pageSize?: number
  sort?: ProductSort
  /** Price range in minor units; filtered on the server. */
  minPriceMinor?: number
  maxPriceMinor?: number
  /** gift_catalog occasion / recipient codes; filtered on the server. */
  occasion?: string
  recipient?: string
}

const productListSchema = pagedSchema(wireProductSchema)

export async function listProducts(query: ProductQuery = {}): Promise<ProductListResult> {
  if (query.ids && query.ids.length === 0) return { items: [], total: 0, page: 1, totalPages: 0 }
  const res = await serverRequest('storefront/catalog/products', productListSchema, {
    withShop: true,
    revalidate: CATALOG_REVALIDATE_SECONDS,
    tags: ['catalog'],
    query: {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 24,
      search: query.search,
      categoryId: query.categoryId,
      ids: query.ids?.slice(0, 200).join(','),
      sort: query.sort ?? 'newest',
      minPrice: query.minPriceMinor !== undefined ? query.minPriceMinor / 100 : undefined,
      maxPrice: query.maxPriceMinor !== undefined ? query.maxPriceMinor / 100 : undefined,
      occasion: query.occasion,
      recipient: query.recipient,
    },
  })
  const items = res.items.map(toSummary)
  return {
    items,
    total: res.total ?? items.length,
    page: res.page ?? query.page ?? 1,
    totalPages: res.totalPages ?? 1,
  }
}

function optionsToStrings(values: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!values) return out
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined) continue
    out[key] = typeof value === 'object' ? JSON.stringify(value) : String(value)
  }
  return out
}

const productDetailSchema = z.object({
  item: wireProductSchema.extend({
    variants: z.array(wireVariantSchema.extend({ pricing: wirePricingSchema.nullable().optional() })).optional(),
  }),
})

/** Resolve a product by handle (or id) through the public detail route. */
export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  let res: z.infer<typeof productDetailSchema>
  try {
    res = await serverRequest(`storefront/catalog/products/${encodeURIComponent(slug)}`, productDetailSchema, {
      withShop: true,
      revalidate: CATALOG_REVALIDATE_SECONDS,
      tags: ['catalog', `product:${slug}`],
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
  const product = res.item
  const summary = toSummary(product)
  const variants: ProductVariant[] = (product.variants ?? [])
    .filter((v) => v.is_active !== false)
    .map((v) => ({
      id: v.id,
      name: v.name?.trim() || v.sku || 'Default',
      sku: v.sku ?? null,
      isDefault: Boolean(v.is_default),
      options: optionsToStrings(v.option_values),
      imageUrl: absoluteMediaUrl(v.default_media_url),
      priceMinor: priceOf(v.pricing) ?? summary.priceMinor,
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
  return {
    ...summary,
    priceMinor: summary.priceMinor ?? variants[0]?.priceMinor ?? null,
    description: product.description ?? null,
    sku: product.sku ?? null,
    seoTitle: product.seo_title ?? null,
    seoDescription: product.seo_description ?? null,
    minQty: Math.max(1, product.min_order_qty ?? 1),
    maxQty: product.max_order_qty ?? null,
    categories: (product.categories ?? []).map((c) => ({ id: c.id, name: c.name ?? 'Category' })),
    variants,
  }
}

const categoryListSchema = z.object({ items: z.array(wireCategorySchema) }).passthrough()

export async function listCategories(): Promise<Category[]> {
  const res = await serverRequest('storefront/catalog/categories', categoryListSchema, {
    withShop: true,
    revalidate: 600,
    tags: ['catalog', 'categories'],
  })
  return res.items
    .filter((c) => c.isActive !== false)
    .map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug?.trim() || slugify(c.name),
      parentId: c.parentId ?? null,
      depth: c.depth ?? 0,
    }))
}

/** Never throws: catalog pages render an error/empty state instead of failing when the backend is down. */
export async function safe<T>(promise: Promise<T>): Promise<{ data: T; error: null } | { data: null; error: string }> {
  try {
    return { data: await promise, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
