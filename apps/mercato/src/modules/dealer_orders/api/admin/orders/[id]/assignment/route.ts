import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import { DealerOrderAssignment } from '../../../../../data/entities.js'
import { serializeAssignment } from '../../../../../commands/assignments.js'
import {
  assignOrderSchema,
  reassignOrderSchema,
  cancelAssignmentSchema,
} from '../../../../../data/validators.js'
import {
  ACTIVE_STATUSES,
  DEALER_ORDER_ASSIGN_COMMAND,
  DEALER_ORDER_REASSIGN_COMMAND,
  DEALER_ORDER_CANCEL_COMMAND,
} from '../../../../../lib/constants.js'
import {
  adminHandler,
  runAdminCommand,
  readRouteParam,
  readJsonBody,
  requireIdempotencyKey,
} from '../../../../../lib/http.js'
import { adminAssignmentTag } from '../../../../openapi.js'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dealer_orders.view'] },
  POST: { requireAuth: true, requireFeatures: ['dealer_orders.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['dealer_orders.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['dealer_orders.manage'] },
}

/** GET /api/admin/orders/:id/assignment — current active assignment for an order */
export const GET = adminHandler('admin.orders.assignment.get', async ({ routeCtx, container, scope }) => {
  const orderId = readRouteParam(routeCtx, 'id')
  if (!orderId) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  const em = container.resolve<EntityManager>('em')

  const assignment = await em.findOne(DealerOrderAssignment, {
    orderId,
    tenantId: scope.tenantId,
    status: { $in: ACTIVE_STATUSES },
    deletedAt: null,
  } as FilterQuery<DealerOrderAssignment>)

  return NextResponse.json({ assignment: assignment ? serializeAssignment(assignment) : null })
})

/** POST /api/admin/orders/:id/assignment — assign order to a dealer */
export const POST = adminHandler('admin.orders.assignment.create', async ({ req, routeCtx, container, scope, translate }) => {
  requireIdempotencyKey(req, translate)
  const orderId = readRouteParam(routeCtx, 'id')
  if (!orderId) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  const body = await readJsonBody(req) as Record<string, unknown>
  const parsed = assignOrderSchema.parse({ ...body, orderId })

  const result = await runAdminCommand<DealerOrderAssignment>(
    container, DEALER_ORDER_ASSIGN_COMMAND, { ...parsed, orderId }, scope, req,
  )
  return NextResponse.json({ id: result.id }, { status: 201 })
})

/** PUT /api/admin/orders/:id/assignment — reassign order to a different dealer */
export const PUT = adminHandler('admin.orders.assignment.reassign', async ({ req, routeCtx, container, scope, translate }) => {
  requireIdempotencyKey(req, translate)
  const orderId = readRouteParam(routeCtx, 'id')
  if (!orderId) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  const body = await readJsonBody(req) as Record<string, unknown>
  const parsed = reassignOrderSchema.parse({ ...body, orderId })

  const result = await runAdminCommand<DealerOrderAssignment>(
    container, DEALER_ORDER_REASSIGN_COMMAND, { ...parsed, orderId }, scope, req,
  )
  return NextResponse.json({ id: result.id })
})

/** DELETE /api/admin/orders/:id/assignment — cancel the active assignment */
export const DELETE = adminHandler('admin.orders.assignment.cancel', async ({ req, routeCtx, container, scope }) => {
  const orderId = readRouteParam(routeCtx, 'id')
  if (!orderId) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  const body = await readJsonBody(req) as Record<string, unknown>
  const parsed = cancelAssignmentSchema.parse({ ...body, orderId })

  await runAdminCommand(container, DEALER_ORDER_CANCEL_COMMAND, { ...parsed, orderId }, scope, req)
  return NextResponse.json({ ok: true })
})

export const openApi: OpenApiRouteDoc = {
  tag: adminAssignmentTag,
  summary: 'Dealer order assignment for a specific order',
  pathParams: z.object({ id: z.string().uuid().describe('Order ID') }),
  methods: {
    GET: {
      summary: 'Get current assignment',
      tags: [adminAssignmentTag],
      responses: [{ status: 200, description: 'Current active assignment or null', schema: z.object({ assignment: z.unknown().nullable() }) }],
    },
    POST: {
      summary: 'Assign order to dealer',
      tags: [adminAssignmentTag],
      requestBody: { contentType: 'application/json', schema: assignOrderSchema },
      responses: [{ status: 201, description: 'Assignment created', schema: z.object({ id: z.string().uuid() }) }],
    },
    PUT: {
      summary: 'Reassign order to a different dealer',
      tags: [adminAssignmentTag],
      requestBody: { contentType: 'application/json', schema: reassignOrderSchema },
      responses: [{ status: 200, description: 'Reassigned', schema: z.object({ id: z.string().uuid() }) }],
    },
    DELETE: {
      summary: 'Cancel assignment',
      tags: [adminAssignmentTag],
      requestBody: { contentType: 'application/json', schema: cancelAssignmentSchema },
      responses: [{ status: 200, description: 'Cancelled', schema: z.object({ ok: z.literal(true) }) }],
    },
  },
}
