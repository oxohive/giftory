import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { listAssignmentHistory } from '../../../../../commands/assignments'
import { adminHandler, readRouteParam } from '../../../../../lib/http'
import { adminAssignmentTag } from '../../../../openapi'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dealer_orders.view'] },
}

/**
 * GET /api/admin/orders/:id/assignments (plural) — full assignment HISTORY
 * for one order, including cancelled/superseded rows, ordered newest-first.
 *
 * Previously proposed-not-implemented (API-CONTRACTS.md): the singular
 * `GET .../assignment` route only ever returns the current active
 * assignment (or null) and never 404s. This route is the "proposed addition"
 * documented there — reassignment soft-cancels the prior row and inserts a
 * fresh one, so the full history has always existed in the table; this is
 * the first route that projects it.
 */
export const GET = adminHandler('admin.orders.assignments.history', async ({ routeCtx, container, scope }) => {
  const orderId = readRouteParam(routeCtx, 'id')
  if (!orderId) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  const em = container.resolve<EntityManager>('em')
  const items = await listAssignmentHistory(em, orderId, scope.tenantId)
  return NextResponse.json({ items })
})

export const openApi: OpenApiRouteDoc = {
  tag: adminAssignmentTag,
  summary: "Order's full assignment history",
  pathParams: z.object({ id: z.string().uuid().describe('Order ID') }),
  methods: {
    GET: {
      summary: 'List every assignment ever made for this order, including cancelled/superseded rows',
      tags: [adminAssignmentTag],
      responses: [
        {
          status: 200,
          description: 'Full assignment history, newest first',
          schema: z.object({ items: z.array(z.unknown()) }),
        },
      ],
    },
  },
}
