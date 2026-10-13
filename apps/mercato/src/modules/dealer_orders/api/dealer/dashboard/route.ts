import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { computeDealerDashboard } from '../../../lib/dashboard'
import { adminHandler } from '../../../lib/http'
import { dealerOrderTag } from '../../openapi'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dealer_orders.dealer_access'] },
}

export const dealerDashboardResponseSchema = z.object({
  pendingAcknowledgment: z.number().int(),
  inProduction: z.number().int(),
  dispatchedThisWeek: z.number().int(),
  weekStartsAt: z.string().describe('UTC instant of the most recent Monday 00:00 Asia/Kolkata'),
  timezone: z.literal('Asia/Kolkata'),
})

/**
 * GET /api/dealer/dashboard — order-status counts for the dealer dashboard
 * (FEAT-010 AC #2: "pending acknowledgment, in production, dispatched this
 * week"). See `lib/dashboard.ts`'s `computeDealerDashboard` for why this is a
 * single SQL aggregate scoped to the caller's own dealer profile rather than
 * a client-side sum over `GET /dealer/orders` pages, and for the explicit
 * Asia/Kolkata week-boundary semantics.
 */
export const GET = adminHandler('dealer.dashboard', async ({ container, scope }) => {
  const em = container.resolve<EntityManager>('em')
  const aggregates = await computeDealerDashboard(em, scope.organizationId, scope.tenantId)
  return NextResponse.json(aggregates)
})

export const openApi: OpenApiRouteDoc = {
  tag: dealerOrderTag,
  summary: 'Dealer order dashboard aggregates',
  methods: {
    GET: {
      summary: 'Order-status counts for the dealer dashboard',
      tags: [dealerOrderTag],
      responses: [{ status: 200, description: 'Aggregate counts', schema: dealerDashboardResponseSchema }],
    },
  },
}
