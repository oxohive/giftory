import { z } from 'zod'
import { ASSIGNMENT_STATUSES } from '../lib/constants.js'

export const adminAssignmentTag = 'Dealer Order Assignments (Admin)'
export const dealerOrderTag = 'Dealer Orders (Portal)'

export const assignmentStatusSchema = z.enum(ASSIGNMENT_STATUSES)

export const serializedAssignmentSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  dealerProfileId: z.string().uuid(),
  tenantId: z.string().uuid(),
  organizationId: z.string().uuid(),
  assignedBy: z.string().uuid(),
  assignedAt: z.string().nullable(),
  requiredBy: z.string(),
  status: assignmentStatusSchema,
  statusUpdatedAt: z.string().nullable(),
  statusNote: z.string().nullable(),
  cancelledReason: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

export const pagedAssignmentsSchema = z.object({
  items: z.array(serializedAssignmentSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
})
