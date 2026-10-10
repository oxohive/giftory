import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { DealerOrderAssignment } from '../../../data/entities.js'
import { serializeAssignment } from '../../../commands/assignments.js'
import { assignmentListQuerySchema } from '../../../data/validators.js'
import { adminHandler } from '../../../lib/http.js'
import { dealerOrderTag } from '../../openapi.js'

export const metadata = {
  // FEAT-009: replace requireFeatures with dealer-portal auth once RBAC is complete.
  GET: { requireAuth: true, requireFeatures: ['dealer_orders.dealer_access'] },
}

/**
 * GET /api/dealer/orders — assignments visible to the authenticated dealer.
 *
 * FEAT-009 integration note: once dealer RBAC ships, resolve the calling
 * user's `dealer_profile_id` from their organization membership and filter
 * automatically. Until then the caller must supply `dealerProfileId` as a
 * query param.
 */
export const GET = adminHandler('dealer.orders.list', async ({ req, container, scope }) => {
  const em = container.resolve<EntityManager>('em')
  const url = new URL(req.url)
  const query = assignmentListQuerySchema.parse(Object.fromEntries(url.searchParams))

  const where: FilterQuery<DealerOrderAssignment> = {
    tenantId: scope.tenantId,
    deletedAt: null,
  } as FilterQuery<DealerOrderAssignment>
  if (query.dealerProfileId) (where as Record<string, unknown>).dealerProfileId = query.dealerProfileId
  if (query.status) (where as Record<string, unknown>).status = query.status

  const [items, total] = await em.findAndCount(DealerOrderAssignment, where, {
    orderBy: { assignedAt: 'DESC' },
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
  })

  return NextResponse.json({ items: items.map(serializeAssignment), total, page: query.page, pageSize: query.pageSize })
})

export const openApi: OpenApiRouteDoc = {
  tag: dealerOrderTag,
  summary: "Dealer's assigned orders",
  methods: {
    GET: {
      summary: "List dealer's assigned orders",
      tags: [dealerOrderTag],
      query: assignmentListQuerySchema,
      responses: [
        {
          status: 200,
          description: 'Paged list',
          schema: z.object({ items: z.array(z.unknown()), total: z.number(), page: z.number(), pageSize: z.number() }),
        },
      ],
    },
  },
}
