import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { DealerOrderAssignment } from '../../../../data/entities'
import { buildDealerOrderDetail } from '../../../../commands/assignments'
import { resolveOwnDealerProfileId } from '../../../../commands/shared'
import { adminHandler, readRouteParam } from '../../../../lib/http'
import { dealerOrderTag } from '../../../openapi'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dealer_orders.dealer_access'] },
}

/**
 * GET /api/dealer/orders/:id — single assignment detail.
 *
 * `:id` is the ASSIGNMENT id, not the sales order id (see
 * `buildDealerOrderDetail`'s doc comment) — the assignment must belong to
 * the caller's own (session-derived) dealer profile; filtering by tenant
 * alone would let any dealer in the tenant read any other dealer's
 * assignment by guessing/enumerating its id.
 *
 * The response is the safe, FEAT-010-scoped projection only: product,
 * variant, quantity, gift message, production requirements/deadline, and
 * city+pincode. It never includes customer PII, payment amounts, or other
 * order fields.
 */
export const GET = adminHandler('dealer.orders.detail', async ({ routeCtx, container, scope }) => {
  const em = container.resolve<EntityManager>('em')
  const id = readRouteParam(routeCtx, 'id')
  if (!id) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  const dealerProfileId = await resolveOwnDealerProfileId(em, scope.organizationId, scope.tenantId)

  const assignment = await em.findOne(DealerOrderAssignment, {
    id,
    tenantId: scope.tenantId,
    dealerProfileId,
    deletedAt: null,
  } as FilterQuery<DealerOrderAssignment>)

  if (!assignment) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ assignment: await buildDealerOrderDetail(em, assignment) })
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
