import { z } from 'zod'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { conflict, notFound, badRequest as badReq } from '@open-mercato/shared/lib/crud/errors'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { DealerOrderAssignment } from '../data/entities.js'
import {
  assignOrderSchema,
  reassignOrderSchema,
  cancelAssignmentSchema,
  updateAssignmentStatusSchema,
} from '../data/validators.js'
import {
  ACTIVE_STATUSES,
  DEALER_STATUS_TRANSITIONS,
  DEALER_ORDER_ASSIGNMENT_RESOURCE_KIND,
  DEALER_ORDER_ASSIGN_COMMAND,
  DEALER_ORDER_REASSIGN_COMMAND,
  DEALER_ORDER_CANCEL_COMMAND,
  DEALER_ORDER_UPDATE_STATUS_COMMAND,
} from '../lib/constants.js'
import type { AssignmentStatus } from '../lib/constants.js'
import { resolveCommandScope, resolveUndoScope, toIso } from './shared.js'
import eventsConfig from '../events.js'

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
 * Checks the native `orders` table for payment status via raw SQL to avoid
 * cross-module ORM relations. Returns true when the order is paid.
 *
 * FEAT-008 integration note: dealer approval check (approved status on
 * `dealer_profiles`) should be added here once FEAT-008 is complete.
 */
async function assertOrderIsPaid(em: EntityManager, orderId: string, tenantId: string): Promise<void> {
  const { translate } = await resolveTranslations()
  const rows = await em.getConnection().execute(
    `SELECT id FROM orders WHERE id = ? AND tenant_id = ? AND payment_status = 'paid' LIMIT 1`,
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

const updateStatusCommand: CommandHandler<Record<string, unknown>, DealerOrderAssignment> = {
  id: DEALER_ORDER_UPDATE_STATUS_COMMAND,
  isUndoable: false,
  async execute(rawInput, ctx) {
    const parsed = updateStatusCommandSchema.parse(rawInput)
    const scope = resolveCommandScope(ctx, rawInput as Record<string, unknown>)
    const em = ctx.container.resolve<EntityManager>('em')
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const { translate } = await resolveTranslations()

    const assignment = await em.findOne(DealerOrderAssignment, {
      id: parsed.assignmentId,
      tenantId: scope.tenantId,
      deletedAt: null,
    } as FilterQuery<DealerOrderAssignment>)
    if (!assignment) throw notFound(translate('dealer_orders.errors.assignmentNotFound', 'Assignment not found'))

    if (assignment.status === 'cancelled') {
      throw badReq(translate('dealer_orders.errors.assignmentCancelled', 'Assignment is cancelled and cannot be updated'))
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
      where: { id: parsed.assignmentId, tenantId: scope.tenantId, deletedAt: null } as FilterQuery<DealerOrderAssignment>,
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
  },
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
