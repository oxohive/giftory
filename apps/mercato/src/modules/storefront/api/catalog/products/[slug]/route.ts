import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { getCatalogProduct } from '../../../../lib/catalog'
import { readParam, StorefrontError, storefrontHandler } from '../../../../lib/http'
import { commonErrors, scopeDescription, shopQueryDoc, storefrontTag, wirePricingSchema, wireProductSchema } from '../../../openapi'

export const metadata = {
  GET: {
    requireAuth: false,
    rateLimit: { points: 120, duration: 60, blockDuration: 60, keyPrefix: 'storefront-catalog-product' },
  },
}

const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_\-.]{0,199}$/

export const GET = storefrontHandler('catalog.product', async ({ ctx, container, shopper, translate }) => {
  const slug = readParam(ctx, 'slug')
  if (!slug || !SLUG_PATTERN.test(slug)) {
    throw new StorefrontError(404, 'not_found', translate('storefront.errors.productNotFound', 'Product not found'))
  }
  const em = (container.resolve('em') as EntityManager).fork()
  const item = await getCatalogProduct(em, shopper.scope, slug)
  if (!item) throw new StorefrontError(404, 'not_found', translate('storefront.errors.productNotFound', 'Product not found'))
  return NextResponse.json({ item })
})

const detailSchema = wireProductSchema.extend({
  variants: z.array(
    z.object({
      id: z.string().uuid(),
      product_id: z.string().uuid(),
      name: z.string().nullable(),
      sku: z.string().nullable(),
      is_default: z.boolean(),
      is_active: z.boolean(),
      option_values: z.record(z.string(), z.unknown()).nullable(),
      default_media_url: z.string().nullable(),
      pricing: wirePricingSchema.nullable(),
    }),
  ),
  media: z.array(z.object({ id: z.string().uuid(), fileName: z.string(), url: z.string(), thumbnailUrl: z.string() })),
  gift: z
    .object({
      occasions: z.array(z.string()),
      recipientTypes: z.array(z.string()),
      isCustomizable: z.boolean(),
      proofRequired: z.boolean(),
      giftWrapAvailable: z.boolean(),
      giftMessageMaxLength: z.number().int(),
      productionLeadTimeDays: z.number().int().nullable(),
    })
    .nullable(),
})

export const openApi: OpenApiRouteDoc = {
  tag: storefrontTag,
  summary: 'Storefront product detail',
  pathParams: z.object({ slug: z.string().describe('Product handle or id') }),
  methods: {
    GET: {
      summary: 'Get a live product by handle or id',
      description: `${scopeDescription} Includes active variants with their own prices, product media and the gift profile.`,
      tags: [storefrontTag],
      query: shopQueryDoc,
      responses: [{ status: 200, description: 'Product detail', schema: z.object({ item: detailSchema }) }],
      errors: commonErrors(),
    },
  },
}
