import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import { DealerOrderAssignment } from '../../../../../data/entities'
import { serializeAssignment } from '../../../../../commands/assignments'
import {
  assignOrderSchema,
  reassignOrderSchema,
  cancelAssignmentSchema,
} from '../../../../../data/validators'
import {
  ACTIVE_STATUSES,
  DEALER_ORDER_ASSIGN_COMMAND,
  DEALER_ORDER_REASSIGN_COMMAND,
  DEALER_ORDER_CANCEL_COMMAND,
} from '../../../../../lib/constants'
import {
  adminHandler,
  runAdminCommand,
  readRouteParam,
  readJsonBody,
} from '../../../../../lib/http'
import {
  hashAssignmentRequest,
  requireIdempotencyKey,
  runIdempotentAssignmentWrite,
} from '../../../../../lib/idempotency'
import { adminAssignmentTag } from '../../../../openapi'

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

/**
 * POST /api/admin/orders/:id/assignment — assign order to a dealer.
 *
 * Requires `Idempotency-Key`: a same-key, same-body retry replays the original
 * 201 without assigning again; a same-key, different-body request is 409
 * `idempotency_key_reused` (see `lib/idempotency.ts`).
 */
export const POST = adminHandler('admin.orders.assignment.create', async ({ req, routeCtx, container, scope, translate }) => {
  const idempotencyKey = requireIdempotencyKey(req, translate)
  const orderId = readRouteParam(routeCtx, 'id')
  if (!orderId) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  const body = await readJsonBody(req) as Record<string, unknown>
  const parsed = assignOrderSchema.parse({ ...body, orderId })

  return runIdempotentAssignmentWrite({
    em: container.resolve<EntityManager>('em'),
    scope,
    idempotencyKey,
    operation: 'assign',
    requestHash: hashAssignmentRequest('assign', orderId, {
      dealerProfileId: parsed.dealerProfileId,
      requiredBy: parsed.requiredBy,
    }),
    translate,
    execute: async () => {
      const result = await runAdminCommand<DealerOrderAssignment>(
        container, DEALER_ORDER_ASSIGN_COMMAND, { ...parsed, orderId }, scope, req,
      )
      return { status: 201, body: { id: String(result.id) } }
    },
  })
})

/**
 * PUT /api/admin/orders/:id/assignment — reassign order to a different dealer.
 *
 * Requires `Idempotency-Key` with the same replay semantics as POST — this is
 * what stops a retried reassign from cancelling-and-recreating twice.
 */
export const PUT = adminHandler('admin.orders.assignment.reassign', async ({ req, routeCtx, container, scope, translate }) => {
  const idempotencyKey = requireIdempotencyKey(req, translate)
  const orderId = readRouteParam(routeCtx, 'id')
  if (!orderId) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  const body = await readJsonBody(req) as Record<string, unknown>
  const parsed = reassignOrderSchema.parse({ ...body, orderId })

  return runIdempotentAssignmentWrite({
    em: container.resolve<EntityManager>('em'),
    scope,
    idempotencyKey,
    operation: 'reassign',
    requestHash: hashAssignmentRequest('reassign', orderId, {
      dealerProfileId: parsed.dealerProfileId,
      requiredBy: parsed.requiredBy,
      reason: parsed.reason ?? null,
    }),
    translate,
    execute: async () => {
      const result = await runAdminCommand<DealerOrderAssignment>(
        container, DEALER_ORDER_REASSIGN_COMMAND, { ...parsed, orderId }, scope, req,
      )
      return { status: 200, body: { id: String(result.id) } }
    },
  })
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

const idempotencyHeaders = z.object({
  'Idempotency-Key': z
    .string()
    .min(16)
    .max(128)
    .describe('Required. 16-128 chars of [A-Za-z0-9_-:.]; reuse only to retry the SAME request.'),
})

const idempotencyErrors = [
  { status: 400, description: 'idempotency_key_required / idempotency_key_invalid' },
  { status: 409, description: 'idempotency_key_reused (different body) or idempotency_request_in_progress (retry shortly)' },
]

const idempotencyDescription =
  'Same Idempotency-Key + same body replays the stored response (header Idempotent-Replayed: true) without running again.'

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
      description: idempotencyDescription,
      tags: [adminAssignmentTag],
      headers: idempotencyHeaders,
      errors: idempotencyErrors,
      requestBody: { contentType: 'application/json', schema: assignOrderSchema },
      responses: [{ status: 201, description: 'Assignment created', schema: z.object({ id: z.string().uuid() }) }],
    },
    PUT: {
      summary: 'Reassign order to a different dealer',
      description: idempotencyDescription,
      tags: [adminAssignmentTag],
      headers: idempotencyHeaders,
      errors: idempotencyErrors,
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
