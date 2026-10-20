import { cn } from '@gift/ui'
import { formatMoney } from '@/lib/money'
import { balanceTone } from '@/lib/features/finance/display'

/**
 * Aggregate balance summary — `GET /api/payouts/dealer/ledger/balance` is a real SQL `SUM`, not a
 * client-side sum of whatever page of the ledger happens to be loaded, so this always reflects
 * the dealer's true balance regardless of pagination. A pending balance of exactly 0 renders as
 * "₹0.00", never blank; a negative balance (no payout-sufficiency guard server-side yet) renders
 * in the danger tone, never hidden or clamped.
 */
export function BalanceSummaryCards({
  pendingAmount,
  totalEarned,
  currencyCode,
  loading,
}: {
  pendingAmount: number | null
  totalEarned: number | null
  currencyCode: string
  loading: boolean
}) {
  const tone = pendingAmount === null ? 'zero' : balanceTone(pendingAmount)
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm text-muted-foreground">Pending balance</p>
        <p
          className={cn('mt-1 text-2xl font-semibold tabular-nums', tone === 'negative' && 'text-danger')}
          aria-live="polite"
        >
          {loading || pendingAmount === null ? '—' : formatMoney(pendingAmount, currencyCode)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Earned but not yet paid out, net of recorded payouts and debit adjustments.
        </p>
      </div>
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm text-muted-foreground">Total earned (lifetime)</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums" aria-live="polite">
          {loading || totalEarned === null ? '—' : formatMoney(totalEarned, currencyCode)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Commissions only — unaffected by payouts or adjustments.
        </p>
      </div>
    </div>
  )
}
