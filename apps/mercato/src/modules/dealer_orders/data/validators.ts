import { z } from 'zod'
import { ASSIGNMENT_STATUSES, DEALER_STATUS_TRANSITIONS } from '../lib/constants'
import type { AssignmentStatus } from '../lib/constants'

const uuidSchema = z.string().uuid()

/**
 * Payload scope fields are stripped — tenantId/organizationId are always derived
 * from the authenticated session, never trusted from the request body.
 */
const strippedScope = z.object({ tenantId: z.unknown(), organizationId: z.unknown() }).strip()

// ── Admin: Assign ─────────────────────────────────────────────────────────────

export const assignOrderSchema = strippedScope
  .extend({
    orderId: uuidSchema,
    dealerProfileId: uuidSchema,
    requiredBy: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'requiredBy must be a YYYY-MM-DD date')
      .refine((d) => new Date(d) > new Date(), { message: 'requiredBy must be a future date' }),
  })
  .omit({ tenantId: true, organizationId: true })

export type AssignOrderInput = z.infer<typeof assignOrderSchema>

// ── Admin: Reassign ───────────────────────────────────────────────────────────

export const reassignOrderSchema = strippedScope
  .extend({
    orderId: uuidSchema,
    dealerProfileId: uuidSchema,
    requiredBy: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'requiredBy must be a YYYY-MM-DD date')
      .refine((d) => new Date(d) > new Date(), { message: 'requiredBy must be a future date' }),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .omit({ tenantId: true, organizationId: true })

export type ReassignOrderInput = z.infer<typeof reassignOrderSchema>

// ── Admin: Cancel ─────────────────────────────────────────────────────────────

export const cancelAssignmentSchema = strippedScope
  .extend({
    orderId: uuidSchema,
    reason: z.string().trim().min(1, 'Cancellation reason is required').max(500),
  })
  .omit({ tenantId: true, organizationId: true })

export type CancelAssignmentInput = z.infer<typeof cancelAssignmentSchema>

// ── Dealer: Update status ─────────────────────────────────────────────────────

export const updateAssignmentStatusSchema = strippedScope
  .extend({
    assignmentId: uuidSchema,
    status: z.enum(ASSIGNMENT_STATUSES).refine((s) => s !== 'cancelled' && s !== 'assigned', {
      message: 'Dealers may only transition to: acknowledged, in_production, ready_for_dispatch, dispatched',
    }),
    note: z.string().trim().max(500).optional().nullable(),
    /**
     * Optimistic-concurrency version check (repo convention: editable
     * records expose `updated_at`; clients send it back; a mismatch is a
     * 409). Optional and backward compatible — see
     * `commands/assignments.ts`'s `executeUpdateStatus`.
     */
    updatedAt: z.string().datetime().optional(),
  })
  .omit({ tenantId: true, organizationId: true })
  .superRefine((data, ctx) => {
    const status = data.status as AssignmentStatus
    if (!Object.keys(DEALER_STATUS_TRANSITIONS).includes(status)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown status: ${status}` })
    }
  })

export type UpdateAssignmentStatusInput = z.infer<typeof updateAssignmentStatusSchema>

// ── Shared list query ─────────────────────────────────────────────────────────

/**
 * `sortField` defaults to `assignedAt` (existing behavior, unchanged) but a
 * caller may request server-side sorting by `requiredBy` (the production
 * deadline) — TASK-09's "assigned orders list" needs deadline-ordered
 * results across every page, which is only correct when the database does
 * the ordering; sorting a single already-paginated page client-side would
 * silently be wrong the moment there is more than one page.
 */
export const assignmentListQuerySchema = z.object({
  dealerProfileId: uuidSchema.optional(),
  orderId: uuidSchema.optional(),
  status: z.enum(ASSIGNMENT_STATUSES).optional(),
  sortField: z.enum(['assignedAt', 'requiredBy']).optional().default('assignedAt'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export type AssignmentListQuery = z.infer<typeof assignmentListQuerySchema>
