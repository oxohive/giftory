import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { OrderCommissionSnapshot } from '../../../../../data/entities.js'
import { commissionSnapshotListSchema } from '../../../../../data/validators.js'
import { adminHandler, readRouteParam } from '../../../../../lib/http.js'
import { serializeCommissionSnapshot } from '../../../../../commands/shared.js'
import { adminCommissionTag, pagedSnapshotsSchema } from '../../../../openapi.js'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['commissions.view'] },
}

/** GET /api/admin/dealers/:dealerId/commission — paged commission snapshots for a dealer */
export const GET = adminHandler('admin.dealers.commission.list', async ({ req, routeCtx, container, scope }) => {
  const dealerId = readRouteParam(routeCtx, 'dealerId')
  if (!dealerId) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })

  const url = new URL(req.url)
  const query = commissionSnapshotListSchema.parse({
    ...Object.fromEntries(url.searchParams),
    dealerProfileId: dealerId,
  })

  const em = container.resolve<EntityManager>('em')
  const where: FilterQuery<OrderCommissionSnapshot> = {
    tenantId: scope.tenantId,
    dealerProfileId: dealerId,
    ...(query.orderId ? { orderId: query.orderId } : {}),
    ...(query.assignmentId ? { assignmentId: query.assignmentId } : {}),
  } as FilterQuery<OrderCommissionSnapshot>

  const [snapshots, total] = await em.findAndCount(OrderCommissionSnapshot, where, {
    orderBy: { snapshottedAt: 'DESC' } as never,
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
  })

  return NextResponse.json({ items: snapshots.map(serializeCommissionSnapshot), total, page: query.page, pageSize: query.pageSize })
})

export const openApi: OpenApiRouteDoc = {
  tag: adminCommissionTag,
  summary: 'Commission snapshots for a dealer',
  pathParams: z.object({ dealerId: z.string().uuid().describe('Dealer profile ID') }),
  methods: {
    GET: {
      summary: 'List dealer commission snapshots',
      tags: [adminCommissionTag],
      responses: [{ status: 200, description: 'Paged snapshots', schema: pagedSnapshotsSchema }],
    },
  },
}
