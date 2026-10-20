import { z } from 'zod'

export const adminLedgerTag = 'Dealer Payout Ledger (Admin)'
export const dealerLedgerTag = 'Dealer Payout Ledger (Portal)'

export const serializedEntrySchema = z.object({
  id: z.string().uuid(),
  dealerProfileId: z.string().uuid(),
  tenantId: z.string().uuid(),
  entryType: z.enum(['commission_earned', 'payout_disbursed', 'adjustment_credit', 'adjustment_debit']),
  amount: z.number().int(),
  currencyCode: z.string(),
  direction: z.enum(['credit', 'debit']),
  referenceType: z.enum(['order_commission_snapshot', 'manual_payout', 'adjustment']),
  referenceId: z.string().uuid(),
  note: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
})

export const pagedEntriesSchema = z.object({
  items: z.array(serializedEntrySchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
})

export const balanceSchema = z.object({
  dealerProfileId: z.string().uuid(),
  pendingAmount: z.number().int().describe('Earned but not yet paid out (paise)'),
  totalEarned: z.number().int().describe('Lifetime commissions earned (paise)'),
  currencyCode: z.string(),
})
