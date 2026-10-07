import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { buildQueryParams } from '@open-mercato/shared/lib/crud/query-params'
import { parseIdsParam } from '@open-mercato/shared/lib/crud/ids'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { storefrontProfilesQuerySchema } from '../../../data/validators'
import { GIFT_FULFILLMENT_MODES } from '../../../lib/constants'
import { resolveStorefrontScope } from '../../../lib/storefrontScope'
import { listStorefrontProfiles } from '../../../lib/storefrontQueries'
import { giftCatalogStorefrontTag } from '../../openapi'

const logger = createLogger('gift_catalog').child({ component: 'storefront.profiles' })

const MAX_PRODUCT_IDS = 100

/**
 * Public storefront read: gift metadata for a set of catalog products, or the
 * products matching an occasion / recipient filter. Only profiles of live,
 * active catalog products in the resolved shop are returned.
 */
export const metadata = {
  GET: {
    requireAuth: false,
    rateLimit: { points: 120, duration: 60, blockDuration: 60, keyPrefix: 'gift-catalog-storefront-profiles' },
  },
}

const profileSchema = z.object({
  productId: z.string().uuid(),
  occasions: z.array(z.string()),
  recipientTypes: z.array(z.string()),
  isCustomizable: z.boolean(),
  proofRequired: z.boolean(),
  giftWrapAvailable: z.boolean(),
  giftMessageMaxLength: z.number().int(),
  productionLeadTimeDays: z.number().int().nullable(),
  personalizationNotes: z.string().nullable(),
  fulfillmentMode: z.enum(GIFT_FULFILLMENT_MODES),
})

const responseSchema = z.object({
  ok: z.literal(true),
  items: z.array(profileSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
  totalIsCapped: z.boolean(),
})
const errorSchema = z.object({ ok: z.literal(false), error: z.string() })

export async function GET(req: Request) {
  const { translate } = await resolveTranslations()
  const url = new URL(req.url)
  const parsed = storefrontProfilesQuerySchema.safeParse(buildQueryParams(url.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: translate('gift_catalog.errors.invalidQuery', 'Invalid query') }, { status: 400 })
  }
  const query = parsed.data
  const productIdsSupplied = typeof query.productIds === 'string' && query.productIds.trim().length > 0
  // A supplied-but-malformed id list matches nothing; it never widens to "all".
  const productIds = productIdsSupplied ? parseIdsParam(query.productIds, MAX_PRODUCT_IDS) : undefined

  try {
    const container = await createRequestContainer()
    const resolved = await resolveStorefrontScope(req, container, query)
    if (!resolved.ok) {
      const message =
        resolved.reason === 'shop_required'
          ? translate('gift_catalog.errors.shopRequired', 'Shop identifier is required')
          : translate('gift_catalog.errors.shopNotFound', 'Shop not found')
      return NextResponse.json({ ok: false, error: message }, { status: resolved.status })
    }
    const em = (container.resolve('em') as EntityManager).fork()
    const page = await listStorefrontProfiles(em, resolved.scope, {
      productIds,
      occasion: query.occasion,
      recipient: query.recipient,
      customizable: query.customizable === undefined ? undefined : query.customizable === 'true',
      page: query.page,
      pageSize: query.pageSize,
    })
    return NextResponse.json({ ok: true, ...page })
  } catch (err) {
    logger.error('Failed to list storefront gift profiles', { err })
    return NextResponse.json(
      { ok: false, error: translate('gift_catalog.errors.loadFailed', 'Failed to load gift catalog data') },
      { status: 500 },
    )
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: giftCatalogStorefrontTag,
  summary: 'Storefront gift profiles',
  methods: {
    GET: {
      summary: 'Get gift metadata for products, or filter products by occasion/recipient',
      description:
        'Unauthenticated storefront endpoint. Pass `productIds` (comma-separated, max 100) to fetch gift metadata for products already on screen, or `occasion` / `recipient` / `customizable` to find matching product IDs (recipient matches also include products targeted at `anyone`). Only live, active catalog products are returned. Shop resolution: custom-domain host, else customer session, else `orgSlug` / `organizationId`; the tenant is always derived server-side. Rate limited per IP.',
      tags: [giftCatalogStorefrontTag],
      query: storefrontProfilesQuerySchema,
      responses: [{ status: 200, description: 'Paged gift profiles', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid query or missing shop identifier', schema: errorSchema },
        { status: 404, description: 'Shop not found or does not match the host/session', schema: errorSchema },
        { status: 429, description: 'Too many requests', schema: errorSchema },
      ],
    },
  },
}
