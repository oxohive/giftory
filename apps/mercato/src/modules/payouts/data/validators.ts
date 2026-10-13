import { z } from 'zod'

const uuidSchema = z.string().uuid()
const strippedScope = z.object({ tenantId: z.unknown(), organizationId: z.unknown() }).strip()

/** Record a manual payout disbursement (debit entry). */
export const recordPayoutSchema = strippedScope
  .extend({
    dealerProfileId: uuidSchema,
    /** Amount in INR paise (positive integer). */
    amount: z.number().int().positive(),
    /** Bank transfer UTR number or payment reference. */
    note: z.string().trim().min(1).max(500),
  })
  .omit({ tenantId: true, organizationId: true })

export type RecordPayoutInput = z.infer<typeof recordPayoutSchema>

/** Create an adjustment entry (credit or debit). Note is mandatory. */
export const createAdjustmentSchema = strippedScope
  .extend({
    dealerProfileId: uuidSchema,
    direction: z.enum(['credit', 'debit']),
    /** Amount in INR paise (positive integer). */
    amount: z.number().int().positive(),
    /** Mandatory reason for the adjustment. */
    note: z.string().trim().min(1, 'Note is required for adjustments').max(500),
  })
  .omit({ tenantId: true, organizationId: true })

export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>

/** List / filter ledger entries. */
export const ledgerListSchema = z.object({
  dealerProfileId: uuidSchema.optional(),
  entryType: z.enum(['commission_earned', 'payout_disbursed', 'adjustment_credit', 'adjustment_debit']).optional(),
  direction: z.enum(['credit', 'debit']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export type LedgerListQuery = z.infer<typeof ledgerListSchema>
