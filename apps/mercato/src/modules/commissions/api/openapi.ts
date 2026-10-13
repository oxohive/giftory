import { z } from 'zod'

export const adminRulesTag = 'Commission Rules (Admin)'
export const adminCommissionTag = 'Commission Snapshots (Admin)'
export const dealerEarningsTag = 'Dealer Earnings (Portal)'

export const serializedRuleSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  dealerProfileId: z.string().uuid().nullable(),
  productTypeCode: z.string().nullable(),
  rateBps: z.number().int(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  createdBy: z.string().uuid(),
  createdAt: z.string(),
})

export const pagedRulesSchema = z.object({
  items: z.array(serializedRuleSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
})

export const serializedSnapshotSchema = z.object({
  id: z.string().uuid(),
  assignmentId: z.string().uuid(),
  orderId: z.string().uuid(),
  dealerProfileId: z.string().uuid(),
  tenantId: z.string().uuid(),
  subtotalAmount: z.number().int(),
  currencyCode: z.string(),
  commissionRateBps: z.number().int(),
  commissionAmount: z.number().int(),
  ruleId: z.string().uuid().nullable(),
  snapshottedAt: z.string(),
})

export const pagedSnapshotsSchema = z.object({
  items: z.array(serializedSnapshotSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
})
