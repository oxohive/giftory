import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { parseIdsParam } from '@open-mercato/shared/lib/crud/ids'
import {
  CatalogProduct,
  CatalogProductCategory,
  CatalogProductCategoryAssignment,
  CatalogProductPrice,
  CatalogProductVariant,
} from '@open-mercato/core/modules/catalog/data/entities'
import { Attachment } from '@open-mercato/core/modules/attachments/data/entities'
import { buildAttachmentImageUrl, slugifyAttachmentFileName } from '@open-mercato/core/modules/attachments/lib/imageUrls'
import { listStorefrontProfiles, type StorefrontGiftProfile } from '../../gift_catalog/lib/storefrontQueries'
import type { CatalogProductsQuery } from '../data/validators'
import { MAX_LINE_QUANTITY, STOREFRONT_CURRENCY, STOREFRONT_PRICE_KIND_CODE, type LineIssueCode } from './constants'
import { DEFAULT_GIFT_RULES, validateGiftOptions } from './giftOptions'
import {
  checkQuantity,
  lowestUnitPrice,
  priceLine,
  resolveUnitPrice,
  selectStorefrontPrice,
  toNumberOrNull,
  type PricedAmounts,
  type StorefrontPriceRow,
  type UnitPrice,
} from './pricing'
import type { StorefrontScope } from './scope'

/**
 * Public catalog reads (G1/G6) and server-side re-pricing. Reads the native
 * catalog entities scoped by tenant + organization; only live (not deleted),
 * active products inside their availability window are visible. Gift metadata
 * comes from gift_catalog's storefront query helper (scalar product ids only).
 */

/** Bound for filters that must be evaluated in memory (price range / price sort). */
export const PRICE_FILTER_SCAN_LIMIT = 1000
const MAX_CATEGORY_FILTER = 50

type Ref = string | { id?: string | null } | null | undefined

export function refId(ref: Ref): string | null {
  if (!ref) return null
  if (typeof ref === 'string') return ref
  return typeof ref.id === 'string' ? ref.id : null
}

function pricingContext(now: Date) {
  return { currencyCode: STOREFRONT_CURRENCY, priceKindCode: STOREFRONT_PRICE_KIND_CODE, now }
}

function liveProductWhere(scope: StorefrontScope, now: Date): Record<string, unknown> {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    deletedAt: null,
    isActive: true,
    $and: [
      { $or: [{ availableFrom: null }, { availableFrom: { $lte: now } }] },
      { $or: [{ availableUntil: null }, { availableUntil: { $gte: now } }] },
    ],
  }
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`)
}

export async function loadLiveProducts(
  em: EntityManager,
  scope: StorefrontScope,
  productIds: string[],
  now = new Date(),
): Promise<Map<string, CatalogProduct>> {
  if (!productIds.length) return new Map()
  const rows = await findWithDecryption(
    em,
    CatalogProduct,
    { ...liveProductWhere(scope, now), id: { $in: Array.from(new Set(productIds)) } } as FilterQuery<CatalogProduct>,
    undefined,
    scope,
  )
  return new Map(rows.map((row) => [String(row.id), row]))
}

export async function loadActiveVariants(
  em: EntityManager,
  scope: StorefrontScope,
  productIds: string[],
): Promise<Map<string, CatalogProductVariant[]>> {
  const byProduct = new Map<string, CatalogProductVariant[]>()
  if (!productIds.length) return byProduct
  const rows = await findWithDecryption(
    em,
    CatalogProductVariant,
    {
      product: { $in: productIds },
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      deletedAt: null,
      isActive: true,
    } as FilterQuery<CatalogProductVariant>,
    { orderBy: { isDefault: 'desc', createdAt: 'asc' } } as never,
    scope,
  )
  for (const row of rows) {
    const productId = refId(row.product as Ref)
    if (!productId) continue
    const list = byProduct.get(productId) ?? []
    list.push(row)
    byProduct.set(productId, list)
  }
  return byProduct
}

export async function loadPriceRows(
  em: EntityManager,
  scope: StorefrontScope,
  productIds: string[],
  variantsByProduct: Map<string, CatalogProductVariant[]>,
): Promise<StorefrontPriceRow[]> {
  if (!productIds.length) return []
  const variantProduct = new Map<string, string>()
  for (const [productId, variants] of variantsByProduct) {
    for (const variant of variants) variantProduct.set(String(variant.id), productId)
  }
  const variantIds = Array.from(variantProduct.keys())
  const or: Record<string, unknown>[] = [{ product: { $in: productIds } }]
  if (variantIds.length) or.push({ variant: { $in: variantIds } })
  const rows = await em.find(
    CatalogProductPrice,
    {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      currencyCode: STOREFRONT_CURRENCY,
      $or: or,
    } as FilterQuery<CatalogProductPrice>,
    { populate: ['priceKind'] as never },
  )
  return rows.map((row) => {
    const variantId = refId(row.variant as Ref)
    const priceKind = row.priceKind as unknown as { code?: string } | string | null
    const kindCode = priceKind && typeof priceKind === 'object' && typeof priceKind.code === 'string' ? priceKind.code : row.kind
    return {
      id: String(row.id),
      productId: refId(row.product as Ref) ?? (variantId ? variantProduct.get(variantId) ?? null : null),
      variantId,
      offerId: refId(row.offer as Ref),
      currencyCode: row.currencyCode,
      kindCode: kindCode ?? '',
      minQuantity: row.minQuantity ?? null,
      maxQuantity: row.maxQuantity ?? null,
      unitPriceNet: toNumberOrNull(row.unitPriceNet),
      unitPriceGross: toNumberOrNull(row.unitPriceGross),
      taxRate: toNumberOrNull(row.taxRate),
      channelId: row.channelId ?? null,
      customerId: row.customerId ?? null,
      customerGroupId: row.customerGroupId ?? null,
      userId: row.userId ?? null,
      userGroupId: row.userGroupId ?? null,
      startsAt: row.startsAt ?? null,
      endsAt: row.endsAt ?? null,
    }
  })
}

type CategoryRef = { id: string; name: string; slug: string | null }

async function loadProductCategories(
  em: EntityManager,
  scope: StorefrontScope,
  productIds: string[],
): Promise<Map<string, CategoryRef[]>> {
  const result = new Map<string, CategoryRef[]>()
  if (!productIds.length) return result
  const assignments = await em.find(
    CatalogProductCategoryAssignment,
    { product: { $in: productIds }, tenantId: scope.tenantId, organizationId: scope.organizationId } as FilterQuery<CatalogProductCategoryAssignment>,
    { populate: ['category'] as never, orderBy: { position: 'asc' } as never },
  )
  for (const assignment of assignments) {
    const productId = refId(assignment.product as Ref)
    const category = assignment.category as unknown as CatalogProductCategory | null
    if (!productId || !category || category.deletedAt || category.isActive === false) continue
    const list = result.get(productId) ?? []
    list.push({ id: String(category.id), name: category.name, slug: category.slug ?? null })
    result.set(productId, list)
  }
  return result
}

async function productIdsForCategories(em: EntityManager, scope: StorefrontScope, categoryIds: string[]): Promise<string[]> {
  const categories = await em.find(CatalogProductCategory, {
    id: { $in: categoryIds },
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    deletedAt: null,
    isActive: true,
  } as FilterQuery<CatalogProductCategory>)
  const expanded = new Set<string>()
  for (const category of categories) {
    expanded.add(String(category.id))
    for (const descendant of Array.isArray(category.descendantIds) ? category.descendantIds : []) expanded.add(String(descendant))
  }
  if (!expanded.size) return []
  const assignments = await em.find(
    CatalogProductCategoryAssignment,
    { category: { $in: Array.from(expanded) }, tenantId: scope.tenantId, organizationId: scope.organizationId } as FilterQuery<CatalogProductCategoryAssignment>,
  )
  return Array.from(new Set(assignments.map((assignment) => refId(assignment.product as Ref)).filter((id): id is string => !!id)))
}

export async function loadGiftProfiles(
  em: EntityManager,
  scope: StorefrontScope,
  productIds: string[],
): Promise<Map<string, StorefrontGiftProfile>> {
  if (!productIds.length) return new Map()
  const page = await listStorefrontProfiles(em, scope, {
    productIds: Array.from(new Set(productIds)),
    page: 1,
    pageSize: productIds.length,
  })
  return new Map(page.items.map((profile) => [profile.productId, profile]))
}

export type WirePricing = {
  currency_code: string
  unit_price_net: number
  unit_price_gross: number
  tax_rate: number
  kind: string
  price_id: string
}

function toWirePricing(unit: UnitPrice | null): WirePricing | null {
  if (!unit) return null
  return {
    currency_code: STOREFRONT_CURRENCY,
    unit_price_net: unit.unitNet,
    unit_price_gross: unit.unitGross,
    tax_rate: unit.taxRate,
    kind: STOREFRONT_PRICE_KIND_CODE,
    price_id: unit.priceId,
  }
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export type WireProduct = ReturnType<typeof serializeProduct>

function serializeProduct(product: CatalogProduct, categories: CategoryRef[], pricing: WirePricing | null) {
  return {
    id: String(product.id),
    title: product.title,
    subtitle: product.subtitle ?? null,
    description: product.description ?? null,
    sku: product.sku ?? null,
    handle: product.handle ?? null,
    primary_currency_code: product.primaryCurrencyCode ?? STOREFRONT_CURRENCY,
    default_media_url: product.defaultMediaUrl ?? null,
    is_configurable: Boolean(product.isConfigurable),
    is_active: true,
    is_quote_only: Boolean(product.isQuoteOnly),
    requires_shipping: product.requiresShipping !== false,
    min_order_qty: product.minOrderQty ?? null,
    max_order_qty: product.maxOrderQty ?? null,
    order_qty_increment: product.orderQtyIncrement ?? null,
    seo_title: product.seoTitle ?? null,
    seo_description: product.seoDescription ?? null,
    categories,
    categoryIds: categories.map((category) => category.id),
    pricing,
    created_at: iso(product.createdAt),
  }
}

function productTaxRate(product: CatalogProduct): number | null {
  return toNumberOrNull(product.taxRate)
}

async function buildProductCards(
  em: EntityManager,
  scope: StorefrontScope,
  products: CatalogProduct[],
  now: Date,
): Promise<Array<{ product: CatalogProduct; unit: UnitPrice | null; wire: WireProduct }>> {
  const ids = products.map((product) => String(product.id))
  const [variants, categories] = await Promise.all([loadActiveVariants(em, scope, ids), loadProductCategories(em, scope, ids)])
  const rows = await loadPriceRows(em, scope, ids, variants)
  return products.map((product) => {
    const id = String(product.id)
    const variantIds = (variants.get(id) ?? []).map((variant) => String(variant.id))
    const unit = lowestUnitPrice(rows, id, variantIds, pricingContext(now), productTaxRate(product))
    return { product, unit, wire: serializeProduct(product, categories.get(id) ?? [], toWirePricing(unit)) }
  })
}

export type ProductListResult = {
  items: WireProduct[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  totalIsCapped: boolean
}

function intersect(base: Set<string> | null, next: string[]): Set<string> {
  if (!base) return new Set(next)
  const nextSet = new Set(next)
  return new Set(Array.from(base).filter((id) => nextSet.has(id)))
}

export async function listCatalogProducts(
  em: EntityManager,
  scope: StorefrontScope,
  query: CatalogProductsQuery,
  now = new Date(),
): Promise<ProductListResult> {
  const empty: ProductListResult = { items: [], total: 0, page: query.page, pageSize: query.pageSize, totalPages: 0, totalIsCapped: false }
  let idFilter: Set<string> | null = null

  if (query.ids !== undefined) {
    // A supplied-but-malformed id list matches nothing; it never widens to "all".
    idFilter = intersect(idFilter, parseIdsParam(query.ids, 200))
  }
  const categoryIds = [
    ...(query.categoryId ? [query.categoryId] : []),
    ...(query.categoryIds ? parseIdsParam(query.categoryIds, MAX_CATEGORY_FILTER) : []),
  ]
  if (query.categoryId || query.categoryIds) {
    idFilter = intersect(idFilter, categoryIds.length ? await productIdsForCategories(em, scope, categoryIds) : [])
  }
  if (query.occasion || query.recipient || query.customizable) {
    const profiles = await listStorefrontProfiles(em, scope, {
      occasion: query.occasion,
      recipient: query.recipient,
      customizable: query.customizable === undefined ? undefined : query.customizable === 'true',
      page: 1,
      pageSize: PRICE_FILTER_SCAN_LIMIT * 2,
    })
    idFilter = intersect(idFilter, profiles.items.map((profile) => profile.productId))
  }
  if (idFilter && idFilter.size === 0) return empty

  const where: Record<string, unknown> = liveProductWhere(scope, now)
  if (idFilter) where.id = { $in: Array.from(idFilter) }
  if (query.handle) where.handle = query.handle
  const term = query.search?.trim()
  if (term) {
    const like = `%${escapeLike(term)}%`
    ;(where.$and as unknown[]).push({
      $or: [{ title: { $ilike: like } }, { subtitle: { $ilike: like } }, { sku: { $ilike: like } }, { handle: { $ilike: like } }],
    })
  }

  const priceDependent = query.minPrice !== undefined || query.maxPrice !== undefined || query.sort === 'price-asc' || query.sort === 'price-desc'
  const orderBy = query.sort === 'title' ? { title: 'asc', id: 'asc' } : { createdAt: 'desc', id: 'asc' }

  if (!priceDependent) {
    const offset = (query.page - 1) * query.pageSize
    const [products, total] = await Promise.all([
      findWithDecryption(em, CatalogProduct, where as FilterQuery<CatalogProduct>, { orderBy, limit: query.pageSize, offset } as never, scope),
      em.count(CatalogProduct, where as FilterQuery<CatalogProduct>),
    ])
    const cards = await buildProductCards(em, scope, products, now)
    return {
      items: cards.map((card) => card.wire),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
      totalIsCapped: false,
    }
  }

  const scanned = await findWithDecryption(
    em,
    CatalogProduct,
    where as FilterQuery<CatalogProduct>,
    { orderBy, limit: PRICE_FILTER_SCAN_LIMIT + 1 } as never,
    scope,
  )
  const totalIsCapped = scanned.length > PRICE_FILTER_SCAN_LIMIT
  const cards = await buildProductCards(em, scope, totalIsCapped ? scanned.slice(0, PRICE_FILTER_SCAN_LIMIT) : scanned, now)
  let filtered = cards.filter((card) => {
    if (query.minPrice === undefined && query.maxPrice === undefined) return true
    if (!card.unit) return false
    if (query.minPrice !== undefined && card.unit.unitGross < query.minPrice) return false
    if (query.maxPrice !== undefined && card.unit.unitGross > query.maxPrice) return false
    return true
  })
  if (query.sort === 'price-asc') filtered = filtered.sort((a, b) => (a.unit?.unitGross ?? Infinity) - (b.unit?.unitGross ?? Infinity))
  if (query.sort === 'price-desc') filtered = filtered.sort((a, b) => (b.unit?.unitGross ?? -1) - (a.unit?.unitGross ?? -1))
  const offset = (query.page - 1) * query.pageSize
  return {
    items: filtered.slice(offset, offset + query.pageSize).map((card) => card.wire),
    total: filtered.length,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(filtered.length / query.pageSize),
    totalIsCapped,
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function getCatalogProduct(em: EntityManager, scope: StorefrontScope, slugOrId: string, now = new Date()) {
  const where: Record<string, unknown> = liveProductWhere(scope, now)
  if (UUID_PATTERN.test(slugOrId)) where.$and = [...(where.$and as unknown[]), { $or: [{ id: slugOrId }, { handle: slugOrId }] }]
  else where.handle = slugOrId
  const [product] = await findWithDecryption(
    em,
    CatalogProduct,
    where as FilterQuery<CatalogProduct>,
    { limit: 1, orderBy: { createdAt: 'asc' } } as never,
    scope,
  )
  if (!product) return null
  const id = String(product.id)
  const [variantsByProduct, categories, profiles, media] = await Promise.all([
    loadActiveVariants(em, scope, [id]),
    loadProductCategories(em, scope, [id]),
    loadGiftProfiles(em, scope, [id]),
    em.find(
      Attachment,
      { entityId: 'catalog:catalog_product', recordId: id, tenantId: scope.tenantId, organizationId: scope.organizationId } as FilterQuery<Attachment>,
      { orderBy: { createdAt: 'asc' } as never },
    ),
  ])
  const variants = variantsByProduct.get(id) ?? []
  const rows = await loadPriceRows(em, scope, [id], variantsByProduct)
  const ctx = { ...pricingContext(now), quantity: 1 }
  const fallbackTaxRate = productTaxRate(product)
  const productLevelRow = selectStorefrontPrice(rows, { productId: id, variantId: null }, ctx)
  const productLevel = productLevelRow ? resolveUnitPrice(productLevelRow, fallbackTaxRate) : null
  const unit = lowestUnitPrice(rows, id, variants.map((variant) => String(variant.id)), pricingContext(now), fallbackTaxRate)
  const profile = profiles.get(id) ?? null
  return {
    ...serializeProduct(product, categories.get(id) ?? [], toWirePricing(unit ?? productLevel)),
    variants: variants.map((variant) => {
      const row = selectStorefrontPrice(rows, { productId: id, variantId: String(variant.id) }, ctx)
      const variantUnit = row ? resolveUnitPrice(row, toNumberOrNull(variant.taxRate) ?? fallbackTaxRate) : null
      return {
        id: String(variant.id),
        product_id: id,
        name: variant.name ?? null,
        sku: variant.sku ?? null,
        is_default: Boolean(variant.isDefault),
        is_active: true,
        option_values: (variant.optionValues as Record<string, unknown> | null | undefined) ?? null,
        default_media_url: variant.defaultMediaUrl ?? null,
        pricing: toWirePricing(variantUnit),
      }
    }),
    media: media.map((attachment) => ({
      id: String(attachment.id),
      fileName: attachment.fileName,
      url: buildAttachmentImageUrl(String(attachment.id), { slug: slugifyAttachmentFileName(attachment.fileName) }),
      thumbnailUrl: buildAttachmentImageUrl(String(attachment.id), {
        width: 360,
        height: 360,
        slug: slugifyAttachmentFileName(attachment.fileName),
      }),
    })),
    gift: profile
      ? {
          occasions: profile.occasions,
          recipientTypes: profile.recipientTypes,
          isCustomizable: profile.isCustomizable,
          proofRequired: profile.proofRequired,
          giftWrapAvailable: profile.giftWrapAvailable,
          giftMessageMaxLength: profile.giftMessageMaxLength,
          productionLeadTimeDays: profile.productionLeadTimeDays,
        }
      : null,
  }
}

export async function listCatalogCategories(em: EntityManager, scope: StorefrontScope) {
  const rows = await em.find(
    CatalogProductCategory,
    { tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null, isActive: true } as FilterQuery<CatalogProductCategory>,
    { orderBy: { depth: 'asc', name: 'asc' } as never },
  )
  return rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    slug: row.slug ?? null,
    description: row.description ?? null,
    parentId: row.parentId ?? null,
    depth: Number(row.depth ?? 0),
    isActive: true,
  }))
}

// ---------------------------------------------------------------------------
// Server-side re-pricing of cart / order lines
// ---------------------------------------------------------------------------

export type LineRequest = {
  productId: string
  variantId?: string | null
  quantity: number
  giftWrap?: boolean | null
  giftMessage?: string | null
}

export type PricedLine = {
  index: number
  productId: string
  variantId: string | null
  quantity: number
  giftWrap: boolean
  giftMessage: string | null
  title: string
  variantName: string | null
  sku: string | null
  handle: string | null
  imageUrl: string | null
  isCustomizable: boolean
  maxQuantity: number
  amounts: PricedAmounts
}

export type LineIssue = { index: number; productId: string; variantId: string | null; code: LineIssueCode; maxLength?: number }

export type RepriceResult = { lines: PricedLine[]; issues: LineIssue[] }

/**
 * Re-price every requested line from the catalog (never from the client):
 * product must be live, the variant must belong to it, the quantity must
 * respect the product's order rules, and gift options must respect the
 * product's gift profile. Lines with issues are reported, not priced.
 */
export async function repriceLines(
  em: EntityManager,
  scope: StorefrontScope,
  requests: LineRequest[],
  now = new Date(),
): Promise<RepriceResult> {
  const productIds = Array.from(new Set(requests.map((request) => request.productId)))
  const products = await loadLiveProducts(em, scope, productIds, now)
  const liveIds = Array.from(products.keys())
  const [variantsByProduct, profiles] = await Promise.all([
    loadActiveVariants(em, scope, liveIds),
    loadGiftProfiles(em, scope, liveIds),
  ])
  const rows = await loadPriceRows(em, scope, liveIds, variantsByProduct)
  const lines: PricedLine[] = []
  const issues: LineIssue[] = []

  requests.forEach((request, index) => {
    const requestedVariantId = request.variantId ?? null
    const fail = (code: LineIssueCode, extra?: Partial<LineIssue>) =>
      issues.push({ index, productId: request.productId, variantId: requestedVariantId, code, ...extra })
    const product = products.get(request.productId)
    if (!product) return fail('product_unavailable')
    if (product.isQuoteOnly) return fail('quote_only')

    const variants = variantsByProduct.get(request.productId) ?? []
    let variant: CatalogProductVariant | null = null
    if (requestedVariantId) {
      variant = variants.find((candidate) => String(candidate.id) === requestedVariantId) ?? null
      if (!variant) return fail('variant_unavailable')
    } else if (variants.length === 1) {
      variant = variants[0]!
    } else if (variants.length > 1) {
      variant = variants.find((candidate) => candidate.isDefault) ?? null
      if (!variant) return fail('variant_required')
    }

    const quantityIssue = checkQuantity(
      request.quantity,
      { minOrderQty: product.minOrderQty ?? null, maxOrderQty: product.maxOrderQty ?? null, orderQtyIncrement: product.orderQtyIncrement ?? null },
      MAX_LINE_QUANTITY,
    )
    if (quantityIssue) return fail(quantityIssue)

    const variantId = variant ? String(variant.id) : null
    const row = selectStorefrontPrice(rows, { productId: request.productId, variantId }, { ...pricingContext(now), quantity: request.quantity })
    const unit = row ? resolveUnitPrice(row, toNumberOrNull(variant?.taxRate) ?? productTaxRate(product)) : null
    if (!unit) return fail('price_unavailable')

    const profile = profiles.get(request.productId) ?? null
    const gift = validateGiftOptions(
      { giftWrap: request.giftWrap, giftMessage: request.giftMessage },
      profile ? { giftWrapAvailable: profile.giftWrapAvailable, giftMessageMaxLength: profile.giftMessageMaxLength } : DEFAULT_GIFT_RULES,
    )
    if (!gift.ok) return fail(gift.code, { maxLength: gift.maxLength })

    const maxQuantity = product.maxOrderQty && product.maxOrderQty > 0 ? Math.min(product.maxOrderQty, MAX_LINE_QUANTITY) : MAX_LINE_QUANTITY
    lines.push({
      index,
      productId: request.productId,
      variantId,
      quantity: request.quantity,
      giftWrap: gift.giftWrap,
      giftMessage: gift.giftMessage,
      title: product.title,
      variantName: variant?.name ?? null,
      sku: variant?.sku ?? product.sku ?? null,
      handle: product.handle ?? null,
      imageUrl: variant?.defaultMediaUrl ?? product.defaultMediaUrl ?? null,
      isCustomizable: Boolean(profile?.isCustomizable),
      maxQuantity,
      amounts: priceLine(unit, request.quantity),
    })
  })
  return { lines, issues }
}
