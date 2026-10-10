import { z } from 'zod'
import { MAX_RATE_BPS, MIN_RATE_BPS } from '../lib/constants.js'

const uuidSchema = z.string().uuid()
const strippedScope = z.object({ tenantId: z.unknown(), organizationId: z.unknown() }).strip()

// ── Commission rule ───────────────────────────────────────────────────────────

export const commissionRuleCreateSchema = strippedScope
  .extend({
    dealerProfileId: uuidSchema.nullable().optional(),
    productTypeCode: z.string().trim().min(1).max(100).nullable().optional(),
    rateBps: z
      .number()
      .int()
      .min(MIN_RATE_BPS, `Rate must be at least ${MIN_RATE_BPS} bps`)
      .max(MAX_RATE_BPS, `Rate must be at most ${MAX_RATE_BPS} bps`),
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveFrom must be YYYY-MM-DD'),
  })
  .omit({ tenantId: true, organizationId: true })

export type CommissionRuleCreateInput = z.infer<typeof commissionRuleCreateSchema>

export const commissionRuleDeactivateSchema = strippedScope
  .extend({ id: uuidSchema })
  .omit({ tenantId: true, organizationId: true })

export type CommissionRuleDeactivateInput = z.infer<typeof commissionRuleDeactivateSchema>

export const commissionRuleListSchema = z.object({
  dealerProfileId: uuidSchema.optional(),
  productTypeCode: z.string().trim().min(1).max(100).optional(),
  activeOnly: z.coerce.boolean().default(true),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export type CommissionRuleListQuery = z.infer<typeof commissionRuleListSchema>

// ── Snapshot (internal — not exposed directly to HTTP callers) ────────────────

export const commissionSnapshotListSchema = z.object({
  dealerProfileId: uuidSchema.optional(),
  orderId: uuidSchema.optional(),
  assignmentId: uuidSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export type CommissionSnapshotListQuery = z.infer<typeof commissionSnapshotListSchema>
