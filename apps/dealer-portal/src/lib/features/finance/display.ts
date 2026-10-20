/**
 * Pure display/formatting helpers for the earnings/ledger screens — no React, no fetch, so this
 * runs under plain `node --test`. All amounts from `commissions`/`payouts` are already integer
 * paise (API-CONTRACTS.md's "Money" convention); nothing in this file performs its own
 * paise<->rupee division or multiplication — every amount is handed to `formatMoney` exactly as
 * received from the backend, so there is no floating-point drift introduced at this layer.
 *
 * Imports `formatBps`/`formatMoney` from `@gift/ui/money` (the package's `./money` export,
 * `src/money.ts` — plain TS, no JSX) rather than this app's `@/lib/money` re-export or the
 * package's root entry (`src/index.tsx`): a `@/*` path alias is only resolved by Next's/TS's
 * bundler, not by plain `node --test` (confirmed directly — the root entry's JSX makes it an
 * unparseable `.tsx` file to plain Node, and `@/*` imports throw `ERR_MODULE_NOT_FOUND` the same
 * way under `node --test`), which is how this module's own tests
 * (tests/finance-display.test.mjs) run it directly against real fixtures.
 */
import type { LedgerDirection, LedgerEntryType } from '@gift/api-client'
import { formatBps, formatMoney } from '@gift/ui/money'

export type BalanceTone = 'positive' | 'negative' | 'zero'

/**
 * A pending balance of exactly 0 is a real, valid state (a brand-new dealer, or one fully paid
 * out) — it renders as "zero", never falls through to a blank/undefined display. A negative
 * balance is also a real, valid state today (API-CONTRACTS.md Gap 5/6 — no payout-sufficiency
 * guard, no adjustment-credit floor, server-side) and must render as negative, never clamped.
 */
export function balanceTone(pendingAmountPaise: number): BalanceTone {
  if (pendingAmountPaise > 0) return 'positive'
  if (pendingAmountPaise < 0) return 'negative'
  return 'zero'
}

const ENTRY_TYPE_LABELS: Record<LedgerEntryType, string> = {
  commission_earned: 'Commission earned',
  payout_disbursed: 'Payout disbursed',
  adjustment_credit: 'Adjustment (credit)',
  adjustment_debit: 'Adjustment (debit)',
}

export function entryTypeLabel(entryType: LedgerEntryType): string {
  return ENTRY_TYPE_LABELS[entryType] ?? entryType
}

export type EntryTone = 'credit' | 'debit'

export function entryTone(direction: LedgerDirection): EntryTone {
  return direction === 'credit' ? 'credit' : 'debit'
}

/**
 * "+ ₹1,499.00" / "− ₹1,499.00" — the sign is a separate prefix character, never folded into the
 * amount passed to `formatMoney` (which always receives `Math.abs(amountPaise)`). Ledger entries
 * always record a positive `amount`, with `direction` carrying the sign, but this guards against
 * a double-negative display even if that ever changed upstream.
 */
export function formatSignedAmount(amountPaise: number, direction: LedgerDirection, currencyCode = 'INR'): string {
  const prefix = direction === 'credit' ? '+ ' : '− '
  return `${prefix}${formatMoney(Math.abs(amountPaise), currencyCode)}`
}

/**
 * "8%" for a real rule, or an explicit "No active rule" when the snapshot recorded the 0%/no-rule
 * fallback (the rate resolver found no matching rule at assignment time — see
 * `commissions/lib/rateResolver.ts`) — never an unlabeled "0%", which would read as "this dealer
 * earns nothing on this order" rather than "no commission rule was configured for this order".
 */
export function commissionRateLabel(snapshot: { commissionRateBps: number; ruleId: string | null }): string {
  if (snapshot.ruleId === null && snapshot.commissionRateBps === 0) return 'No active rule'
  return formatBps(snapshot.commissionRateBps)
}
