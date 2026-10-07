import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { listCatalogCategories } from '../../../lib/catalog'
import { storefrontHandler } from '../../../lib/http'
import { commonErrors, scopeDescription, shopQueryDoc, storefrontTag } from '../../openapi'

export const metadata = {
  GET: {
    requireAuth: false,
    rateLimit: { points: 120, duration: 60, blockDuration: 60, keyPrefix: 'storefront-catalog-categories' },
  },
}

export const GET = storefrontHandler('catalog.categories', async ({ container, shopper }) => {
  const em = (container.resolve('em') as EntityManager).fork()
  const items = await listCatalogCategories(em, shopper.scope)
  return NextResponse.json({ items })
})

const categorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string().nullable(),
  description: z.string().nullable(),
  parentId: z.string().uuid().nullable(),
  depth: z.number().int(),
  isActive: z.boolean(),
})

export const openApi: OpenApiRouteDoc = {
  tag: storefrontTag,
  summary: 'Storefront categories',
  methods: {
    GET: {
      summary: 'List active categories',
      description: scopeDescription,
      tags: [storefrontTag],
      query: shopQueryDoc,
      responses: [{ status: 200, description: 'Active categories ordered by depth and name', schema: z.object({ items: z.array(categorySchema) }) }],
      errors: commonErrors(),
    },
  },
}
