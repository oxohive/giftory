import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { OrderCommissionSnapshot } from '../../../../../data/entities.js'
import { adminHandler, readRouteParam } from '../../../../../lib/http.js'
import { serializeCommissionSnapshot } from '../../../../../commands/shared.js'
import { adminCommissionTag, serializedSnapshotSchema } from '../../../../openapi.js'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['commissions.view'] },
}

/** GET /api/admin/orders/:id/commission — commission snapshot for an order */
export const GET = adminHandler('admin.orders.commission.get', async ({ routeCtx, container, scope, translate }) => {
  const orderId = readRouteParam(routeCtx, 'id')
  if (!orderId) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  const em = container.resolve<EntityManager>('em')

  const snapshot = await em.findOne(OrderCommissionSnapshot, {
    orderId,
    tenantId: scope.tenantId,
  } as FilterQuery<OrderCommissionSnapshot>)

  if (!snapshot) {
    return NextResponse.json(
      { error: translate('commissions.errors.snapshotNotFound', 'Commission snapshot not found'), code: 'not_found' },
      { status: 404 },
    )
  }

  return NextResponse.json({ commission: serializeCommissionSnapshot(snapshot) })
})

export const openApi: OpenApiRouteDoc = {
  tag: adminCommissionTag,
  summary: 'Commission snapshot for a specific order',
  pathParams: z.object({ id: z.string().uuid().describe('Order ID') }),
  methods: {
    GET: {
      summary: 'Get order commission snapshot',
      tags: [adminCommissionTag],
      responses: [{ status: 200, description: 'Snapshot', schema: z.object({ commission: serializedSnapshotSchema }) }],
    },
  },
}
