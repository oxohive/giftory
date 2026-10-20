'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '@gift/api-client'
import { ErrorNotice, Pagination, PermissionDenied, SessionExpired } from '@gift/ui'
import { fetchLedger, fetchLedgerBalance } from '@/lib/features/finance/api'
import { DEFAULT_PAGE_SIZE } from '@/lib/features/finance/query'
import { BalanceSummaryCards } from './BalanceSummaryCards'
import { EMPTY_LEDGER_FILTERS, LedgerFilters, type LedgerFilterState } from './LedgerFilters'
import { LedgerTable } from './LedgerTable'

/**
 * `/ledger` — read-only, append-only transaction log (commission credits, recorded payouts,
 * manual adjustments) plus the same balance summary shown on `/earnings`. There is no per-entry
 * running balance in the backend response (API-CONTRACTS.md: computing one client-side across
 * pages is explicitly not recommended — it would require fetching every earlier page first) —
 * this view ships the recommended shape: the aggregate balance prominently, and the paginated
 * list as a plain chronological log.
 *
 * Same owner-only gate as `/earnings` — see EarningsView's doc comment for the permission
 * decision this mirrors.
 */
export function LedgerView() {
  const router = useRouter()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<LedgerFilterState>(EMPTY_LEDGER_FILTERS)

  const balanceQuery = useQuery({ queryKey: ['dealer-ledger-balance'], queryFn: fetchLedgerBalance })
  const ledgerQuery = useQuery({
    queryKey: ['dealer-ledger', page, filters.entryType, filters.direction],
    queryFn: () => fetchLedger({ page, pageSize: DEFAULT_PAGE_SIZE, ...filters }),
  })

  const blockingError = [balanceQuery.error, ledgerQuery.error].find(
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

  function handleFiltersChange(next: LedgerFilterState) {
    setFilters(next)
    setPage(1)
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Ledger</h1>
        <p className="text-sm text-muted-foreground">
          Append-only record of commissions earned, payouts recorded, and manual adjustments. See{' '}
          <Link href="/earnings" className="text-primary underline-offset-4 hover:underline">
            earnings
          </Link>{' '}
          for commission detail per assigned order.
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

      <LedgerFilters value={filters} onChange={handleFiltersChange} />

      <LedgerTable items={ledgerQuery.data?.items ?? []} loading={ledgerQuery.isLoading} />
      {ledgerQuery.isError && !blockingError ? (
        <ErrorNotice message="Couldn't load the ledger." onRetry={() => ledgerQuery.refetch()} />
      ) : null}

      <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={ledgerQuery.data?.total ?? 0} onPageChange={setPage} />
    </div>
  )
}
