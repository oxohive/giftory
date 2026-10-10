import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { OrderCommissionSnapshot } from '../../../data/entities.js'
import { commissionSnapshotListSchema } from '../../../data/validators.js'
import { adminHandler } from '../../../lib/http.js'
import { serializeCommissionSnapshot } from '../../../commands/shared.js'
import { dealerEarningsTag, pagedSnapshotsSchema } from '../../openapi.js'

export const metadata = {
  // FEAT-009: replace requireFeatures with dealer-portal auth once RBAC is complete.
  GET: { requireAuth: true, requireFeatures: ['commissions.dealer_access'] },
}

/**
 * GET /api/dealer/earnings — commission snapshots for the authenticated dealer.
 *
 * FEAT-009 integration note: once dealer RBAC ships, resolve dealerProfileId
 * from the session; until then the caller supplies it as a query param.
 */
export const GET = adminHandler('dealer.earnings.list', async ({ req, container, scope }) => {
  const url = new URL(req.url)
  const query = commissionSnapshotListSchema.parse(Object.fromEntries(url.searchParams))

  const em = container.resolve<EntityManager>('em')
  const where: FilterQuery<OrderCommissionSnapshot> = {
    tenantId: scope.tenantId,
  } as FilterQuery<OrderCommissionSnapshot>
  if (query.dealerProfileId) (where as Record<string, unknown>).dealerProfileId = query.dealerProfileId
  if (query.orderId) (where as Record<string, unknown>).orderId = query.orderId
  if (query.assignmentId) (where as Record<string, unknown>).assignmentId = query.assignmentId

  const [items, total] = await em.findAndCount(OrderCommissionSnapshot, where, {
    orderBy: { snapshottedAt: 'DESC' } as never,
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
  })

  return NextResponse.json({ items: items.map(serializeCommissionSnapshot), total, page: query.page, pageSize: query.pageSize })
})

export const openApi: OpenApiRouteDoc = {
  tag: dealerEarningsTag,
  summary: "Dealer's commission earnings",
  methods: {
    GET: {
      summary: "List dealer's commission earnings",
      tags: [dealerEarningsTag],
      responses: [{ status: 200, description: 'Paged snapshots', schema: pagedSnapshotsSchema }],
    },
  },
}
