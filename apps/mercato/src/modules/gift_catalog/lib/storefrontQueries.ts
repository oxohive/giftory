import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CatalogProduct } from '@open-mercato/core/modules/catalog/data/entities'
import { GiftOccasion, GiftProductProfile } from '../data/entities'
import type { GiftCatalogScope } from '../commands/shared'
import type { GiftFulfillmentMode } from './constants'

/**
 * Upper bound on profiles considered for one storefront filter request. The
 * visibility check against catalog products happens after the profile match,
 * so the match is bounded and the response reports `totalIsCapped` when hit.
 */
export const STOREFRONT_PROFILE_SCAN_LIMIT = 2000

export type StorefrontOccasion = {
  code: string
  label: string
  description: string | null
  imageUrl: string | null
  sortOrder: number
}

export type StorefrontGiftProfile = {
  productId: string
  occasions: string[]
  recipientTypes: string[]
  isCustomizable: boolean
  proofRequired: boolean
  giftWrapAvailable: boolean
  giftMessageMaxLength: number
  productionLeadTimeDays: number | null
  personalizationNotes: string | null
  fulfillmentMode: GiftFulfillmentMode
}

export async function listActiveOccasions(em: EntityManager, scope: GiftCatalogScope): Promise<StorefrontOccasion[]> {
  const rows = await em.find(
    GiftOccasion,
    {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      deletedAt: null,
      isActive: true,
    } as FilterQuery<GiftOccasion>,
    { orderBy: { sortOrder: 'asc', label: 'asc' } },
  )
  return rows.map((row) => ({
    code: row.code,
    label: row.label,
    description: row.description ?? null,
    imageUrl: row.imageUrl ?? null,
    sortOrder: Number(row.sortOrder ?? 0),
  }))
}

function toPublicProfile(profile: GiftProductProfile): StorefrontGiftProfile {
  return {
    productId: String(profile.productId),
    occasions: Array.isArray(profile.occasions) ? [...profile.occasions] : [],
    recipientTypes: Array.isArray(profile.recipientTypes) ? [...profile.recipientTypes] : [],
    isCustomizable: Boolean(profile.isCustomizable),
    proofRequired: Boolean(profile.proofRequired),
    giftWrapAvailable: Boolean(profile.giftWrapAvailable),
    giftMessageMaxLength: Number(profile.giftMessageMaxLength ?? 0),
    productionLeadTimeDays: profile.productionLeadTimeDays ?? null,
    personalizationNotes: profile.personalizationNotes ?? null,
    fulfillmentMode: profile.fulfillmentMode === 'platform' ? 'platform' : 'dealer',
  }
}

export type StorefrontProfileFilter = {
  productIds?: string[]
  occasion?: string
  recipient?: string
  customizable?: boolean
  page: number
  pageSize: number
}

export type StorefrontProfilePage = {
  items: StorefrontGiftProfile[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  totalIsCapped: boolean
}

/**
 * Gift profiles visible on the storefront: live profiles whose catalog product
 * is live and active in the same tenant/organization. Profiles of inactive or
 * deleted products are never returned, so product IDs cannot be enumerated
 * through this endpoint.
 */
export async function listStorefrontProfiles(
  em: EntityManager,
  scope: GiftCatalogScope,
  filter: StorefrontProfileFilter,
): Promise<StorefrontProfilePage> {
  const where: Record<string, unknown> = {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    deletedAt: null,
  }
  if (filter.productIds) where.productId = { $in: filter.productIds }
  if (filter.occasion) where.occasions = { $overlap: [filter.occasion] }
  // A product targeted at "anyone" suits every recipient filter.
  if (filter.recipient) where.recipientTypes = { $overlap: Array.from(new Set([filter.recipient, 'anyone'])) }
  if (filter.customizable !== undefined) where.isCustomizable = filter.customizable

  const empty: StorefrontProfilePage = {
    items: [],
    total: 0,
    page: filter.page,
    pageSize: filter.pageSize,
    totalPages: 0,
    totalIsCapped: false,
  }
  if (filter.productIds && filter.productIds.length === 0) return empty

  const profiles = await em.find(GiftProductProfile, where as FilterQuery<GiftProductProfile>, {
    orderBy: { updatedAt: 'desc', id: 'asc' },
    limit: STOREFRONT_PROFILE_SCAN_LIMIT + 1,
  })
  const totalIsCapped = profiles.length > STOREFRONT_PROFILE_SCAN_LIMIT
  const candidates = totalIsCapped ? profiles.slice(0, STOREFRONT_PROFILE_SCAN_LIMIT) : profiles
  if (candidates.length === 0) return empty

  const products = await findWithDecryption(
    em,
    CatalogProduct,
    {
      id: { $in: candidates.map((profile) => profile.productId) },
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      deletedAt: null,
      isActive: true,
    } as FilterQuery<CatalogProduct>,
    { fields: ['id'] as never },
    scope,
  )
  const visible = new Set(products.map((product) => String(product.id)))
  const matching = candidates.filter((profile) => visible.has(String(profile.productId)))

  const offset = (filter.page - 1) * filter.pageSize
  const items = matching.slice(offset, offset + filter.pageSize).map(toPublicProfile)
  return {
    items,
    total: matching.length,
    page: filter.page,
    pageSize: filter.pageSize,
    totalPages: Math.ceil(matching.length / filter.pageSize),
    totalIsCapped,
  }
}
