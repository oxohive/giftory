import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { DealerOrderAssignment } from '../../../../data/entities.js'
import { serializeAssignment } from '../../../../commands/assignments.js'
import { adminHandler, readRouteParam } from '../../../../lib/http.js'
import { dealerOrderTag } from '../../../openapi.js'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dealer_orders.dealer_access'] },
}

/** GET /api/dealer/orders/:id — single assignment detail */
export const GET = adminHandler('dealer.orders.detail', async ({ routeCtx, container, scope }) => {
  const em = container.resolve<EntityManager>('em')
  const id = readRouteParam(routeCtx, 'id')
  if (!id) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })

  const assignment = await em.findOne(DealerOrderAssignment, {
    id,
    tenantId: scope.tenantId,
    deletedAt: null,
  } as FilterQuery<DealerOrderAssignment>)

  if (!assignment) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ assignment: serializeAssignment(assignment) })
})

export const openApi: OpenApiRouteDoc = {
  tag: dealerOrderTag,
  summary: 'Dealer order assignment detail',
  pathParams: z.object({ id: z.string().uuid().describe('Assignment ID') }),
  methods: {
    GET: {
      summary: 'Get assignment detail',
      tags: [dealerOrderTag],
      responses: [
        { status: 200, description: 'Assignment detail', schema: z.object({ assignment: z.unknown() }) },
        { status: 404, description: 'Not found', schema: z.object({ error: z.literal('not_found') }) },
      ],
    },
  },
}
