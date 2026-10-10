import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { OrderCommissionSnapshot } from '../../../../data/entities.js'
import { adminHandler, readRouteParam } from '../../../../lib/http.js'
import { serializeCommissionSnapshot } from '../../../../commands/shared.js'
import { dealerEarningsTag, serializedSnapshotSchema } from '../../../openapi.js'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['commissions.dealer_access'] },
}

/** GET /api/dealer/earnings/:assignmentId — commission snapshot for a specific assignment */
export const GET = adminHandler('dealer.earnings.get', async ({ routeCtx, container, scope, translate }) => {
  const assignmentId = readRouteParam(routeCtx, 'assignmentId')
  if (!assignmentId) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  const em = container.resolve<EntityManager>('em')

  const snapshot = await em.findOne(OrderCommissionSnapshot, {
    assignmentId,
    tenantId: scope.tenantId,
  } as FilterQuery<OrderCommissionSnapshot>)

  if (!snapshot) {
    return NextResponse.json(
      { error: translate('commissions.errors.snapshotNotFound', 'Commission snapshot not found'), code: 'not_found' },
      { status: 404 },
    )
  }

  return NextResponse.json({ earning: serializeCommissionSnapshot(snapshot) })
})

export const openApi: OpenApiRouteDoc = {
  tag: dealerEarningsTag,
  summary: 'Earning detail for a specific assignment',
  pathParams: z.object({ assignmentId: z.string().uuid().describe('Assignment ID') }),
  methods: {
    GET: {
      summary: 'Get earning by assignment',
      tags: [dealerEarningsTag],
      responses: [{ status: 200, description: 'Earning', schema: z.object({ earning: serializedSnapshotSchema }) }],
    },
  },
}
