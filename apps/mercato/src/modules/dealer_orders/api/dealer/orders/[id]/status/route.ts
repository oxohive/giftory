import { NextResponse } from 'next/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { updateAssignmentStatusSchema } from '../../../../../data/validators.js'
import { DEALER_ORDER_UPDATE_STATUS_COMMAND } from '../../../../../lib/constants.js'
import { adminHandler, runAdminCommand, readRouteParam, readJsonBody } from '../../../../../lib/http.js'
import { dealerOrderTag } from '../../../../openapi.js'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dealer_orders.dealer_access'] },
}

/** POST /api/dealer/orders/:id/status — dealer updates production status */
export const POST = adminHandler('dealer.orders.status', async ({ req, routeCtx, container, scope }) => {
  const id = readRouteParam(routeCtx, 'id')
  if (!id) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  const body = await readJsonBody(req) as Record<string, unknown>
  const parsed = updateAssignmentStatusSchema.parse({ ...body, assignmentId: id })

  await runAdminCommand(container, DEALER_ORDER_UPDATE_STATUS_COMMAND, { ...parsed }, scope, req)
  return NextResponse.json({ ok: true })
})

export const openApi: OpenApiRouteDoc = {
  tag: dealerOrderTag,
  summary: 'Update dealer order status',
  pathParams: z.object({ id: z.string().uuid().describe('Assignment ID') }),
  methods: {
    POST: {
      summary: 'Update production status',
      tags: [dealerOrderTag],
      requestBody: { contentType: 'application/json', schema: updateAssignmentStatusSchema },
      responses: [
        { status: 200, description: 'Status updated', schema: z.object({ ok: z.literal(true) }) },
      ],
    },
  },
}
