import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { EnricherContext, ResponseEnricher } from '@open-mercato/shared/lib/crud/response-enricher'
import { GiftProductProfile } from './entities'
import { CATALOG_PRODUCT_ENTITY_ID, type GiftFulfillmentMode } from '../lib/constants'

type ProductRecord = Record<string, unknown> & { id?: unknown }

type GiftCatalogProductEnrichment = {
  _giftCatalog: {
    profileId: string
    occasions: string[]
    recipientTypes: string[]
    isCustomizable: boolean
    proofRequired: boolean
    giftWrapAvailable: boolean
    fulfillmentMode: GiftFulfillmentMode
    updatedAt: string | null
  } | null
}

function readId(record: ProductRecord): string | null {
  return typeof record.id === 'string' && record.id.length > 0 ? record.id : null
}

/**
 * Adds a compact, read-only `_giftCatalog` summary to catalog product API
 * responses (list + detail) so admin surfaces and integrations can see gift
 * metadata without a second request. Decorative: non-critical with a null
 * fallback, batched with one scoped query per page (no N+1), and not cached on
 * list hits because it reads a table the catalog list cache does not track.
 */
const productGiftProfileEnricher: ResponseEnricher<ProductRecord, GiftCatalogProductEnrichment> = {
  id: 'gift_catalog.product-gift-profile',
  targetEntity: CATALOG_PRODUCT_ENTITY_ID,
  features: ['gift_catalog.view'],
  priority: 10,
  timeout: 2000,
  critical: false,
  fallback: { _giftCatalog: null },

  async enrichOne(record, context) {
    const [enriched] = await this.enrichMany!([record], context)
    return enriched
  },

  async enrichMany(records, context: EnricherContext) {
    const ids = Array.from(new Set(records.map(readId).filter((id): id is string => id !== null)))
    if (ids.length === 0) return records.map((record) => ({ ...record, _giftCatalog: null }))

    const em = context.em as EntityManager
    const profiles = await em.find(GiftProductProfile, {
      productId: { $in: ids },
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      deletedAt: null,
    } as FilterQuery<GiftProductProfile>)
    const byProduct = new Map(profiles.map((profile) => [profile.productId, profile]))

    return records.map((record) => {
      const id = readId(record)
      const profile = id ? byProduct.get(id) : undefined
      return {
        ...record,
        _giftCatalog: profile
          ? {
              profileId: String(profile.id),
              occasions: [...(profile.occasions ?? [])],
              recipientTypes: [...(profile.recipientTypes ?? [])],
              isCustomizable: Boolean(profile.isCustomizable),
              proofRequired: Boolean(profile.proofRequired),
              giftWrapAvailable: Boolean(profile.giftWrapAvailable),
              fulfillmentMode: profile.fulfillmentMode === 'platform' ? 'platform' : 'dealer',
              updatedAt: profile.updatedAt ? new Date(profile.updatedAt).toISOString() : null,
            }
          : null,
      }
    })
  },
}

export const enrichers: ResponseEnricher[] = [productGiftProfileEnricher]
export default enrichers
