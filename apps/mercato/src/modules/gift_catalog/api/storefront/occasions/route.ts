import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { buildQueryParams } from '@open-mercato/shared/lib/crud/query-params'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { storefrontOccasionsQuerySchema } from '../../../data/validators'
import { resolveStorefrontScope } from '../../../lib/storefrontScope'
import { listActiveOccasions } from '../../../lib/storefrontQueries'
import { giftCatalogStorefrontTag } from '../../openapi'

const logger = createLogger('gift_catalog').child({ component: 'storefront.occasions' })

/**
 * Public storefront read: active occasions for the shop navigation.
 * No staff auth; scope is resolved server-side (custom domain → customer
 * session → shop identifier) and never taken from the payload as tenant.
 * Rate limited per IP by the API dispatcher because it is unauthenticated.
 */
export const metadata = {
  GET: {
    requireAuth: false,
    rateLimit: { points: 120, duration: 60, blockDuration: 60, keyPrefix: 'gift-catalog-storefront-occasions' },
  },
}

const occasionSchema = z.object({
  code: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  sortOrder: z.number().int(),
})

const responseSchema = z.object({ ok: z.literal(true), items: z.array(occasionSchema) })
const errorSchema = z.object({ ok: z.literal(false), error: z.string() })

export async function GET(req: Request) {
  const { translate } = await resolveTranslations()
  const url = new URL(req.url)
  const parsed = storefrontOccasionsQuerySchema.safeParse(buildQueryParams(url.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: translate('gift_catalog.errors.invalidQuery', 'Invalid query') }, { status: 400 })
  }
  try {
    const container = await createRequestContainer()
    const resolved = await resolveStorefrontScope(req, container, parsed.data)
    if (!resolved.ok) {
      const message =
        resolved.reason === 'shop_required'
          ? translate('gift_catalog.errors.shopRequired', 'Shop identifier is required')
          : translate('gift_catalog.errors.shopNotFound', 'Shop not found')
      return NextResponse.json({ ok: false, error: message }, { status: resolved.status })
    }
    const em = (container.resolve('em') as EntityManager).fork()
    const items = await listActiveOccasions(em, resolved.scope)
    return NextResponse.json({ ok: true, items })
  } catch (err) {
    logger.error('Failed to list storefront occasions', { err })
    return NextResponse.json(
      { ok: false, error: translate('gift_catalog.errors.loadFailed', 'Failed to load gift catalog data') },
      { status: 500 },
    )
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: giftCatalogStorefrontTag,
  summary: 'Storefront gift occasions',
  methods: {
    GET: {
      summary: 'List active gift occasions for a shop',
      description:
        'Unauthenticated storefront endpoint. The shop is resolved from the custom-domain host, else the signed-in customer session, else the `orgSlug` / `organizationId` query parameter; the tenant is always derived server-side. Rate limited per IP.',
      tags: [giftCatalogStorefrontTag],
      query: storefrontOccasionsQuerySchema,
      responses: [{ status: 200, description: 'Active occasions ordered by sort order', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid query or missing shop identifier', schema: errorSchema },
        { status: 404, description: 'Shop not found or does not match the host/session', schema: errorSchema },
        { status: 429, description: 'Too many requests', schema: errorSchema },
      ],
    },
  },
}
