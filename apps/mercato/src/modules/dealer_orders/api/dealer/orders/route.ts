import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { DealerOrderAssignment } from '../../../data/entities'
import { serializeAssignment } from '../../../commands/assignments'
import { resolveOwnDealerProfileId } from '../../../commands/shared'
import { assignmentListQuerySchema } from '../../../data/validators'
import { adminHandler } from '../../../lib/http'
import { dealerOrderTag } from '../../openapi'

export const metadata = {
  // FEAT-009: replace requireFeatures with dealer-portal auth once RBAC is complete.
  GET: { requireAuth: true, requireFeatures: ['dealer_orders.dealer_access'] },
}

/**
 * GET /api/dealer/orders — assignments visible to the authenticated dealer.
 *
 * `dealerProfileId` is always derived from the caller's authenticated
 * tenant + organization scope; a caller-supplied `dealerProfileId` query
 * param (if present) is ignored — it can never be used to read another
 * dealer's assignments. Fails closed (404) if the caller's org has no
 * approved dealer profile.
 */
export const GET = adminHandler('dealer.orders.list', async ({ req, container, scope }) => {
  const em = container.resolve<EntityManager>('em')
  const url = new URL(req.url)
  const query = assignmentListQuerySchema.parse(Object.fromEntries(url.searchParams))
  const dealerProfileId = await resolveOwnDealerProfileId(em, scope.organizationId, scope.tenantId)

  const where: FilterQuery<DealerOrderAssignment> = {
    tenantId: scope.tenantId,
    dealerProfileId,
    deletedAt: null,
  } as FilterQuery<DealerOrderAssignment>
  if (query.status) (where as Record<string, unknown>).status = query.status

  const [items, total] = await em.findAndCount(DealerOrderAssignment, where, {
    // Server-side sort across the WHOLE result set, not just the returned
    // page — a client sorting only its current page would be silently wrong
    // once there is more than one page of assignments.
    orderBy: { [query.sortField]: query.sortDir.toUpperCase() } as Record<string, 'ASC' | 'DESC'>,
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
      // dealerProfileId is always derived from the session; omit it from the
      // documented query surface so clients don't assume it has any effect.
      query: assignmentListQuerySchema.omit({ dealerProfileId: true }),
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
