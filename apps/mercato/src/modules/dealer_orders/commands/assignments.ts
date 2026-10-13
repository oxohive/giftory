import { z } from 'zod'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { conflict, notFound, badRequest as badReq } from '@open-mercato/shared/lib/crud/errors'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { DealerOrderAssignment } from '../data/entities'
import {
  assignOrderSchema,
  reassignOrderSchema,
  cancelAssignmentSchema,
  updateAssignmentStatusSchema,
} from '../data/validators'
import {
  ACTIVE_STATUSES,
  DEALER_STATUS_TRANSITIONS,
  DEALER_ORDER_ASSIGNMENT_RESOURCE_KIND,
  DEALER_ORDER_ASSIGN_COMMAND,
  DEALER_ORDER_REASSIGN_COMMAND,
  DEALER_ORDER_CANCEL_COMMAND,
  DEALER_ORDER_UPDATE_STATUS_COMMAND,
} from '../lib/constants'
import type { AssignmentStatus } from '../lib/constants'
import { resolveCommandScope, resolveUndoScope, resolveOwnDealerProfileId, toIso } from './shared'
import { loadDealerOrderDetail, type DealerOrderLineDetail, type DealerOrderShippingDetail } from '../lib/orderDetails'
import eventsConfig from '../events'

const systemScopeSchema = z.object({
  tenantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
})

// ── Serialization ─────────────────────────────────────────────────────────────

export type SerializedAssignment = {
  id: string
  orderId: string
  dealerProfileId: string
  tenantId: string
  organizationId: string
  assignedBy: string
  assignedAt: string | null
  requiredBy: string
  status: AssignmentStatus
  statusUpdatedAt: string | null
  statusNote: string | null
  cancelledReason: string | null
  updatedAt: string | null
}

export function serializeAssignment(a: DealerOrderAssignment): SerializedAssignment {
  return {
    id: String(a.id),
    orderId: String(a.orderId),
    dealerProfileId: String(a.dealerProfileId),
    tenantId: String(a.tenantId),
    organizationId: String(a.organizationId),
    assignedBy: String(a.assignedBy),
    assignedAt: toIso(a.assignedAt),
    requiredBy: a.requiredBy,
    status: a.status,
    statusUpdatedAt: toIso(a.statusUpdatedAt),
    statusNote: a.statusNote ?? null,
    cancelledReason: a.cancelledReason ?? null,
    updatedAt: toIso(a.updatedAt),
  }
}

/**
 * Safe dealer-facing order detail payload (FEAT-010 AC #4): product, variant,
 * quantity, gift message, production requirements/deadline, and city+pincode
 * only. Deliberately excludes `dealerProfileId`/`tenantId`/`organizationId`/
 * `assignedBy`/`cancelledReason` — those are internal scope/audit fields, not
 * part of what the dealer portal's order-detail screen is specified to show.
 *
 * `assignmentId` and `orderId` are both present but distinct on purpose: the
 * dealer portal routes by `assignmentId` (see FEAT-010's `/orders/[id]`
 * contract and the detail route below) — `orderId` is included only as a
 * read-only reference (paired with the human-readable `orderNumber`), never
 * as something the UI should use to call a different endpoint.
 */
export type SerializedDealerOrderDetail = {
  assignmentId: string
  orderId: string
  orderNumber: string | null
  status: AssignmentStatus
  statusNote: string | null
  statusUpdatedAt: string | null
  /** Production deadline set by the admin at assignment time. */
  requiredBy: string
  assignedAt: string | null
  updatedAt: string | null
  lines: DealerOrderLineDetail[]
  shipping: DealerOrderShippingDetail
}

/**
 * Full assignment history for one order, including cancelled/superseded
 * rows, newest first. See `api/admin/orders/[id]/assignments/route.ts` for
 * the route contract this backs — previously "proposed, not yet
 * implemented" per API-CONTRACTS.md.
 */
export async function listAssignmentHistory(
  em: EntityManager,
  orderId: string,
  tenantId: string,
): Promise<SerializedAssignment[]> {
  const items = await em.find(
    DealerOrderAssignment,
    { orderId, tenantId, deletedAt: null } as FilterQuery<DealerOrderAssignment>,
    { orderBy: { assignedAt: 'DESC' } },
  )
  return items.map(serializeAssignment)
}

export async function buildDealerOrderDetail(
  em: EntityManager,
  assignment: DealerOrderAssignment,
): Promise<SerializedDealerOrderDetail> {
  const detail = await loadDealerOrderDetail(em, assignment.orderId, assignment.tenantId)
  return {
    assignmentId: String(assignment.id),
    orderId: String(assignment.orderId),
    orderNumber: detail.orderNumber,
    status: assignment.status,
    statusNote: assignment.statusNote ?? null,
    statusUpdatedAt: toIso(assignment.statusUpdatedAt),
    requiredBy: assignment.requiredBy,
    assignedAt: toIso(assignment.assignedAt),
    updatedAt: toIso(assignment.updatedAt),
    lines: detail.lines,
    shipping: detail.shipping,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function findActiveAssignment(
  em: EntityManager,
  orderId: string,
  tenantId: string,
): Promise<DealerOrderAssignment | null> {
  return em.findOne(DealerOrderAssignment, {
    orderId,
    tenantId,
    status: { $in: ACTIVE_STATUSES },
    deletedAt: null,
  } as FilterQuery<DealerOrderAssignment>)
}

/**
 * Checks the core sales module's `sales_orders` table for payment status via
 * raw SQL to avoid a cross-module ORM relation (mirrors `lib/orderDetails.ts`).
 *
 * Previously queried a table literally named `orders`, which does not exist
 * in this app's schema — Phase 1 checkout writes `SalesOrder` rows to
 * `sales_orders` (verified against `storefront/lib/checkout.ts`'s
 * `createSalesOrder`), not a bespoke `orders` table. Because every existing
 * unit test mocks `em.getConnection().execute(...)`, the wrong table name
 * was never exercised against a real database and every admin order
 * assignment would have failed in production with a
 * `relation "orders" does not exist` error. Fixed here; flagged in this
 * task's handoff since `commissions/subscribers/snapshot-on-assignment.ts`
 * has the identical bug (`orders`/`order_lines`/`gifts`) but is outside this
 * task's owned paths.
 *
 * FEAT-008 integration note: dealer approval check (approved status on
 * `dealer_profiles`) should be added here once FEAT-008 is complete.
 */
export async function assertOrderIsPaid(em: EntityManager, orderId: string, tenantId: string): Promise<void> {
  const { translate } = await resolveTranslations()
  const rows = await em.getConnection().execute(
    `SELECT id FROM sales_orders WHERE id = ? AND tenant_id = ? AND payment_status = 'paid' LIMIT 1`,
    [orderId, tenantId],
  )
  if (!rows.length) {
    // Could be not found OR not paid — surface as "not paid" for security.
    throw badReq(translate('dealer_orders.errors.orderNotPaid', 'Order must be in paid status before it can be assigned'))
  }
}

// ── Assign command ────────────────────────────────────────────────────────────

const assignCommandSchema = assignOrderSchema.and(systemScopeSchema)

const assignCommand: CommandHandler<Record<string, unknown>, DealerOrderAssignment> = {
  id: DEALER_ORDER_ASSIGN_COMMAND,
  isUndoable: false,
  async execute(rawInput, ctx) {
    const parsed = assignCommandSchema.parse(rawInput)
    const scope = resolveCommandScope(ctx, rawInput as Record<string, unknown>)
    const em = ctx.container.resolve<EntityManager>('em')
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const { translate } = await resolveTranslations()
    const userId = ctx.auth?.sub ?? null
    if (!userId) throw badReq('[internal] dealer_orders assign requires an authenticated user')

    await assertOrderIsPaid(em, parsed.orderId, scope.tenantId)

    const existing = await findActiveAssignment(em, parsed.orderId, scope.tenantId)
    if (existing) {
      throw conflict(translate('dealer_orders.errors.orderAlreadyAssigned', 'Order already has an active assignment; use reassign to change the dealer'))
    }

    const assignment = await de.createOrmEntity({
      entity: DealerOrderAssignment,
      data: {
        orderId: parsed.orderId,
        dealerProfileId: parsed.dealerProfileId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        assignedBy: userId,
        requiredBy: parsed.requiredBy,
        status: 'assigned' as AssignmentStatus,
        assignedAt: new Date(),
        statusUpdatedAt: new Date(),
      },
    })

    await eventsConfig.emit('dealer_order.assigned', {
      id: assignment.id,
      orderId: assignment.orderId,
      dealerProfileId: assignment.dealerProfileId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      requiredBy: assignment.requiredBy,
      assignedBy: userId,
    })

    return assignment
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('dealer_orders.audit.assign', 'Assign order to dealer'),
      resourceKind: DEALER_ORDER_ASSIGNMENT_RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: String(result.tenantId),
      organizationId: String(result.organizationId),
      snapshotAfter: serializeAssignment(result),
    }
  },
}

// ── Reassign command ──────────────────────────────────────────────────────────

const reassignCommandSchema = reassignOrderSchema.and(systemScopeSchema)

const reassignCommand: CommandHandler<Record<string, unknown>, DealerOrderAssignment> = {
  id: DEALER_ORDER_REASSIGN_COMMAND,
  isUndoable: false,
  async execute(rawInput, ctx) {
    const parsed = reassignCommandSchema.parse(rawInput)
    const scope = resolveCommandScope(ctx, rawInput as Record<string, unknown>)
    const em = ctx.container.resolve<EntityManager>('em')
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const { translate } = await resolveTranslations()
    const userId = ctx.auth?.sub ?? null
    if (!userId) throw badReq('[internal] dealer_orders reassign requires an authenticated user')

    await assertOrderIsPaid(em, parsed.orderId, scope.tenantId)

    const existing = await findActiveAssignment(em, parsed.orderId, scope.tenantId)
    if (!existing) {
      throw notFound(translate('dealer_orders.errors.assignmentNotFound', 'Assignment not found'))
    }

    // Soft-cancel the existing assignment.
    await de.updateOrmEntity({
      entity: DealerOrderAssignment,
      where: { id: existing.id, tenantId: scope.tenantId, deletedAt: null } as FilterQuery<DealerOrderAssignment>,
      apply: (entity) => {
        entity.status = 'cancelled'
        entity.cancelledReason = parsed.reason ?? 'Reassigned to a different dealer'
        entity.statusUpdatedAt = new Date()
        entity.updatedAt = new Date()
      },
    })

    const newAssignment = await de.createOrmEntity({
      entity: DealerOrderAssignment,
      data: {
        orderId: parsed.orderId,
        dealerProfileId: parsed.dealerProfileId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        assignedBy: userId,
        requiredBy: parsed.requiredBy,
        status: 'assigned' as AssignmentStatus,
        assignedAt: new Date(),
        statusUpdatedAt: new Date(),
      },
    })

    await eventsConfig.emit('dealer_order.reassigned', {
      id: newAssignment.id,
      previousAssignmentId: existing.id,
      orderId: newAssignment.orderId,
      dealerProfileId: newAssignment.dealerProfileId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      requiredBy: newAssignment.requiredBy,
      assignedBy: userId,
    })

    return newAssignment
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('dealer_orders.audit.reassign', 'Reassign order to different dealer'),
      resourceKind: DEALER_ORDER_ASSIGNMENT_RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: String(result.tenantId),
      organizationId: String(result.organizationId),
      snapshotAfter: serializeAssignment(result),
    }
  },
}

// ── Cancel command ────────────────────────────────────────────────────────────

const cancelCommandSchema = cancelAssignmentSchema.and(systemScopeSchema)

const cancelCommand: CommandHandler<Record<string, unknown>, DealerOrderAssignment> = {
  id: DEALER_ORDER_CANCEL_COMMAND,
  isUndoable: false,
  async execute(rawInput, ctx) {
    const parsed = cancelCommandSchema.parse(rawInput)
    const scope = resolveCommandScope(ctx, rawInput as Record<string, unknown>)
    const em = ctx.container.resolve<EntityManager>('em')
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const { translate } = await resolveTranslations()

    const existing = await findActiveAssignment(em, parsed.orderId, scope.tenantId)
    if (!existing) {
      throw notFound(translate('dealer_orders.errors.assignmentNotFound', 'Assignment not found'))
    }

    const updated = await de.updateOrmEntity({
      entity: DealerOrderAssignment,
      where: { id: existing.id, tenantId: scope.tenantId, deletedAt: null } as FilterQuery<DealerOrderAssignment>,
      apply: (entity) => {
        entity.status = 'cancelled'
        entity.cancelledReason = parsed.reason
        entity.statusUpdatedAt = new Date()
        entity.updatedAt = new Date()
      },
    })
    if (!updated) throw notFound(translate('dealer_orders.errors.assignmentNotFound', 'Assignment not found'))

    await eventsConfig.emit('dealer_order.cancelled', {
      id: updated.id,
      orderId: updated.orderId,
      dealerProfileId: updated.dealerProfileId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      cancelledReason: parsed.reason,
    })

    return updated
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('dealer_orders.audit.cancel', 'Cancel dealer order assignment'),
      resourceKind: DEALER_ORDER_ASSIGNMENT_RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: String(result.tenantId),
      organizationId: String(result.organizationId),
      snapshotAfter: serializeAssignment(result),
    }
  },
}

// ── Update status command (dealer) ────────────────────────────────────────────

const updateStatusCommandSchema = updateAssignmentStatusSchema.and(systemScopeSchema)

// Exported standalone (mirroring dealer_onboarding/commands/review.ts's
// executeApprove/executeReject) so the dealer-ownership enforcement below
// can be unit-tested without going through the full command bus.
export async function executeUpdateStatus(
  rawInput: Record<string, unknown>,
  ctx: CommandRuntimeContext,
): Promise<DealerOrderAssignment> {
  const parsed = updateStatusCommandSchema.parse(rawInput)
  const scope = resolveCommandScope(ctx, rawInput as Record<string, unknown>)
  const em = ctx.container.resolve<EntityManager>('em')
  const de = ctx.container.resolve<DataEngine>('dataEngine')
  const { translate } = await resolveTranslations()

  // Derive the caller's own dealer profile from their session scope — never
  // trust a caller-supplied dealerProfileId. Fails closed (404) for a
  // pending/rejected/inactive dealer.
  const dealerProfileId = await resolveOwnDealerProfileId(em, scope.organizationId, scope.tenantId)

  const assignment = await em.findOne(DealerOrderAssignment, {
    id: parsed.assignmentId,
    tenantId: scope.tenantId,
    dealerProfileId,
    deletedAt: null,
  } as FilterQuery<DealerOrderAssignment>)
  if (!assignment) throw notFound(translate('dealer_orders.errors.assignmentNotFound', 'Assignment not found'))

  if (assignment.status === 'cancelled') {
    throw badReq(translate('dealer_orders.errors.assignmentCancelled', 'Assignment is cancelled and cannot be updated'))
  }

  // Optimistic-concurrency check (repo convention): only enforced when the
  // caller sends `updatedAt` — an older client keeps today's last-write-wins
  // behavior; a client that fetched the assignment first gets a real 409 on
  // a stale write (e.g. two staff sessions updating the same assignment)
  // instead of silently overwriting a concurrent status change.
  if (parsed.updatedAt !== undefined && assignment.updatedAt && assignment.updatedAt.toISOString() !== parsed.updatedAt) {
    throw conflict(translate('dealer_orders.errors.assignmentVersionMismatch', 'This order was updated by someone else; reload and try again'))
  }

  const allowed = DEALER_STATUS_TRANSITIONS[assignment.status]
  const newStatus = parsed.status as AssignmentStatus
  if (!allowed.includes(newStatus)) {
    throw badReq(
      translate('dealer_orders.errors.invalidStatusTransition', `Invalid status transition: ${assignment.status} → ${newStatus}`),
    )
  }

  const updated = await de.updateOrmEntity({
    entity: DealerOrderAssignment,
    where: {
      id: parsed.assignmentId,
      tenantId: scope.tenantId,
      dealerProfileId,
      deletedAt: null,
    } as FilterQuery<DealerOrderAssignment>,
    apply: (entity) => {
      entity.status = newStatus
      entity.statusNote = parsed.note ?? null
      entity.statusUpdatedAt = new Date()
      entity.updatedAt = new Date()
    },
  })
  if (!updated) throw notFound(translate('dealer_orders.errors.assignmentNotFound', 'Assignment not found'))

  await eventsConfig.emit('dealer_order.status_updated', {
    id: updated.id,
    orderId: updated.orderId,
    dealerProfileId: updated.dealerProfileId,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    previousStatus: assignment.status,
    newStatus,
  })

  return updated
}

const updateStatusCommand: CommandHandler<Record<string, unknown>, DealerOrderAssignment> = {
  id: DEALER_ORDER_UPDATE_STATUS_COMMAND,
  isUndoable: false,
  execute: executeUpdateStatus,
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('dealer_orders.audit.updateStatus', 'Update dealer order status'),
      resourceKind: DEALER_ORDER_ASSIGNMENT_RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: String(result.tenantId),
      organizationId: String(result.organizationId),
      snapshotAfter: serializeAssignment(result),
    }
  },
}

registerCommand(assignCommand)
registerCommand(reassignCommand)
registerCommand(cancelCommand)
registerCommand(updateStatusCommand)
