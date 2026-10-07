import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { buildQueryParams } from '@open-mercato/shared/lib/crud/query-params'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { catalogProductsQuerySchema } from '../../../data/validators'
import { listCatalogProducts } from '../../../lib/catalog'
import { parseOrThrow, storefrontHandler } from '../../../lib/http'
import { commonErrors, scopeDescription, shopQueryDoc, storefrontTag, wireProductSchema } from '../../openapi'

/**
 * Public product listing (G1/G6): live, active products with INR `regular`
 * prices, categories and media, filterable by category, search, handle, ids,
 * price range and gift occasion/recipient (from gift_catalog).
 */
export const metadata = {
  GET: {
    requireAuth: false,
    rateLimit: { points: 120, duration: 60, blockDuration: 60, keyPrefix: 'storefront-catalog-products' },
  },
}

export const GET = storefrontHandler('catalog.products', async ({ req, container, shopper, translate }) => {
  const query = parseOrThrow(catalogProductsQuerySchema, buildQueryParams(new URL(req.url).searchParams), translate)
  const em = (container.resolve('em') as EntityManager).fork()
  const result = await listCatalogProducts(em, shopper.scope, query)
  return NextResponse.json(result)
})

const listResponseSchema = z.object({
  items: z.array(wireProductSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
  totalIsCapped: z.boolean(),
})

export const openApi: OpenApiRouteDoc = {
  tag: storefrontTag,
  summary: 'Storefront products',
  methods: {
    GET: {
      summary: 'List live products with prices',
      description: `${scopeDescription} Price filters and price sorting are evaluated on at most 1000 matching products (\`totalIsCapped\` reports truncation). \`pricing\` is the lowest public INR \`regular\` price of the product or its active variants.`,
      tags: [storefrontTag],
      query: catalogProductsQuerySchema.merge(shopQueryDoc),
      responses: [{ status: 200, description: 'Paged products (snake_case, decimal major-unit prices)', schema: listResponseSchema }],
      errors: commonErrors(),
    },
  },
}
