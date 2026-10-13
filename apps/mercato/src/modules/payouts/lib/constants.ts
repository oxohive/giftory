export const ENTRY_TYPES = ['commission_earned', 'payout_disbursed', 'adjustment_credit', 'adjustment_debit'] as const
export type EntryType = (typeof ENTRY_TYPES)[number]

export const DIRECTIONS = ['credit', 'debit'] as const
export type Direction = (typeof DIRECTIONS)[number]

export const REFERENCE_TYPES = ['order_commission_snapshot', 'manual_payout', 'adjustment'] as const
export type ReferenceType = (typeof REFERENCE_TYPES)[number]

export const ENTRY_TYPE_DIRECTION: Record<EntryType, Direction> = {
  commission_earned: 'credit',
  payout_disbursed: 'debit',
  adjustment_credit: 'credit',
  adjustment_debit: 'debit',
}

export const DEFAULT_CURRENCY_CODE = 'INR'

export const LEDGER_ENTRY_RESOURCE_KIND = 'payouts.dealer_ledger_entry' as const

export const PAYOUTS_LEDGER_CREDIT_COMMISSION_COMMAND = 'payouts.ledger.credit_commission' as const
export const PAYOUTS_LEDGER_RECORD_PAYOUT_COMMAND = 'payouts.ledger.record_payout' as const
export const PAYOUTS_LEDGER_CREATE_ADJUSTMENT_COMMAND = 'payouts.ledger.create_adjustment' as const

/**
 * Dealer role names, created by `dealer_onboarding`'s setup. Redeclared
 * locally per the module-isolation convention (see
 * `dealer_org_rbac/lib/constants.ts` for the existing precedent) — do not
 * import role names across module boundaries.
 */
export const DEALER_OWNER_ROLE = 'dealer:owner' as const
export const DEALER_STAFF_ROLE = 'dealer:staff' as const
