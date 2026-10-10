import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { DealerOrderAssignment } from '../../../../../data/entities.js'
import { serializeAssignment } from '../../../../../commands/assignments.js'
import { assignmentListQuerySchema } from '../../../../../data/validators.js'
import { adminHandler, readRouteParam } from '../../../../../lib/http.js'
import { adminAssignmentTag } from '../../../../openapi.js'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dealer_orders.view'] },
}

/** GET /api/admin/dealers/:dealerId/orders — all assignments for a dealer */
export const GET = adminHandler('admin.dealers.orders.list', async ({ req, routeCtx, container, scope }) => {
  const dealerId = readRouteParam(routeCtx, 'dealerId')
  if (!dealerId) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  const em = container.resolve<EntityManager>('em')

  const url = new URL(req.url)
  const query = assignmentListQuerySchema.parse(Object.fromEntries(url.searchParams))

  const where: FilterQuery<DealerOrderAssignment> = {
    dealerProfileId: dealerId,
    tenantId: scope.tenantId,
    deletedAt: null,
  } as FilterQuery<DealerOrderAssignment>
  if (query.status) (where as Record<string, unknown>).status = query.status

  const [items, total] = await em.findAndCount(DealerOrderAssignment, where, {
    orderBy: { assignedAt: 'DESC' },
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
  })

  return NextResponse.json({ items: items.map(serializeAssignment), total, page: query.page, pageSize: query.pageSize })
})

export const openApi: OpenApiRouteDoc = {
  tag: adminAssignmentTag,
  summary: 'List orders assigned to a dealer',
  pathParams: z.object({ dealerId: z.string().uuid().describe('Dealer profile ID') }),
  methods: {
    GET: {
      summary: 'Get all assignments for a dealer',
      tags: [adminAssignmentTag],
      query: assignmentListQuerySchema.omit({ dealerProfileId: true }),
      responses: [
        {
          status: 200,
          description: 'Paged list of assignments',
          schema: z.object({ items: z.array(z.unknown()), total: z.number(), page: z.number(), pageSize: z.number() }),
        },
      ],
    },
  },
}
