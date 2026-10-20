'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '@gift/api-client'
import { ErrorNotice, Pagination, PermissionDenied, SessionExpired } from '@gift/ui'
import { fetchEarnings, fetchLedgerBalance } from '@/lib/features/finance/api'
import { DEFAULT_PAGE_SIZE } from '@/lib/features/finance/query'
import { BalanceSummaryCards } from './BalanceSummaryCards'
import { EarningsTable } from './EarningsTable'

/**
 * `/earnings` — read-only. Earnings list + balance summary come straight from the real
 * `commissions`/`payouts` dealer endpoints; nothing here is computed client-side from partial
 * data (the balance is the backend's own SQL aggregate, not a sum of whatever earnings page
 * happens to be loaded).
 *
 * Server-side, `requireRole(['dealer:owner'])` (the page component, one level up) already
 * redirects a staff caller to `/forbidden` before this component ever mounts — per task 00's
 * explicit decision, `commissions.dealer_access`/`payouts.dealer_access` go to `dealer:owner`
 * only, by design (FEAT-009: "Staff cannot access commission or payout data"). The 403 branch
 * below is defense-in-depth for the same decision, in case a session change races the redirect.
 */
export function EarningsView() {
  const router = useRouter()
  const [page, setPage] = useState(1)

  const balanceQuery = useQuery({ queryKey: ['dealer-ledger-balance'], queryFn: fetchLedgerBalance })
  const earningsQuery = useQuery({
    queryKey: ['dealer-earnings', page],
    queryFn: () => fetchEarnings({ page, pageSize: DEFAULT_PAGE_SIZE }),
  })

  const blockingError = [balanceQuery.error, earningsQuery.error].find(
    (err): err is ApiError => err instanceof ApiError && (err.isUnauthorized || err.isForbidden),
  )
  if (blockingError?.isUnauthorized) {
    return <SessionExpired onSignIn={() => router.push('/login')} />
  }
  if (blockingError?.isForbidden) {
    return (
      <PermissionDenied message="Earnings and payouts are only visible to the business owner account. Ask the business owner if you need this information." />
    )
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Earnings</h1>
        <p className="text-sm text-muted-foreground">
          Commission recorded per assigned order. See the{' '}
          <Link href="/ledger" className="text-primary underline-offset-4 hover:underline">
            full ledger
          </Link>{' '}
          for payouts and adjustments.
        </p>
      </div>

      <BalanceSummaryCards
        pendingAmount={balanceQuery.data?.pendingAmount ?? null}
        totalEarned={balanceQuery.data?.totalEarned ?? null}
        currencyCode={balanceQuery.data?.currencyCode ?? 'INR'}
        loading={balanceQuery.isLoading}
      />
      {balanceQuery.isError && !blockingError ? (
        <ErrorNotice message="Couldn't load your balance." onRetry={() => balanceQuery.refetch()} />
      ) : null}

      <EarningsTable items={earningsQuery.data?.items ?? []} loading={earningsQuery.isLoading} />
      {earningsQuery.isError && !blockingError ? (
        <ErrorNotice message="Couldn't load earnings." onRetry={() => earningsQuery.refetch()} />
      ) : null}

      <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={earningsQuery.data?.total ?? 0} onPageChange={setPage} />
    </div>
  )
}
