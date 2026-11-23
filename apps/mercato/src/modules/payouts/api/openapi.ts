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
  pendingAmount: z.number().int().describe('Owed to the dealer now: sum of all credits minus all debits (paise); may be negative'),
  totalEarned: z.number().int().describe('Lifetime commissions earned (paise)'),
  currencyCode: z.string(),
})

export const ledgerWriteHeadersSchema = z.object({
  'Idempotency-Key': z
    .string()
    .min(16)
    .max(128)
    .describe('Required. 16-128 chars of [A-Za-z0-9_-:.]; reuse it only to retry the SAME request (e.g. a UUID per dialog submission).'),
})

export const ledgerWriteErrorSchema = z.object({
  error: z.string(),
  code: z.string().describe('e.g. idempotency_key_required, idempotency_key_invalid, idempotency_key_reused, insufficient_balance, invalid_request'),
  availableAmount: z.number().int().optional().describe('insufficient_balance only: current pendingAmount (paise)'),
  requestedAmount: z.number().int().optional().describe('insufficient_balance only: requested payout (paise)'),
})
