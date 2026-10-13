'use client'

import { useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '@gift/api-client'
import { EmptyState, ErrorNotice, LoadingState, Pagination, PermissionDenied, SessionExpired } from '@gift/ui'
import {
  buildOrdersListSearch,
  DEFAULT_PAGE_SIZE,
  fetchOrdersListPage,
  parseOrdersListState,
  type OrdersListState,
} from '@/lib/features/orders/list'
import { OrdersFilters, type OrdersFilterChange } from './OrdersFilters'
import { OrdersTable } from './OrdersTable'

/**
 * `/orders` — the dealer's assigned-orders list (TASK-09). Pagination, status filter and sort
 * order all live in the URL (`parseOrdersListState`/`buildOrdersListSearch`, list.ts) rather than
 * component state, so a reload or a browser back-navigation restores the exact same view —
 * the URL *is* the state, there is no separate client cache that could drift from it.
 *
 * Requires `<Suspense>` around this component (wired in page.tsx) — `useSearchParams()` opts a
 * client component out of static rendering unless it's inside one, per the App Router's own
 * contract for this hook.
 */
export function OrdersListView() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const state = useMemo(() => parseOrdersListState(searchParams), [searchParams])

  function pushState(next: OrdersListState) {
    router.push(`${pathname}${buildOrdersListSearch(next)}`, { scroll: false })
  }

  /** Status/sort changes always reset to page 1 — browsing a filtered/re-sorted view starting
   *  from whatever page you happened to be on would silently show the wrong slice. */
  function handleFiltersChange(change: OrdersFilterChange) {
    pushState({ ...state, ...change, page: 1 })
  }

  function handlePageChange(page: number) {
    pushState({ ...state, page })
  }

  const query = useQuery({
    queryKey: ['orders-list', state.page, state.status, state.sortField, state.sortDir],
    queryFn: () => fetchOrdersListPage(state),
  })

  const error = query.error instanceof ApiError ? query.error : null
  if (error?.isUnauthorized) {
    return <SessionExpired onSignIn={() => router.push('/login')} />
  }
  if (error?.isForbidden) {
    return <PermissionDenied message="You do not have permission to view assigned orders." />
  }

  const hasActiveFilter = state.status !== ''

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Orders</h1>
        <p className="text-sm text-muted-foreground">
          Orders assigned to your business, sorted by production deadline by default.
        </p>
      </div>

      <OrdersFilters state={state} onChange={handleFiltersChange} />

      {query.isLoading ? (
        <LoadingState label="Loading orders…" />
      ) : query.isError ? (
        <ErrorNotice message="Couldn't load your orders." onRetry={() => query.refetch()} />
      ) : query.data && query.data.items.length === 0 ? (
        <EmptyState title={hasActiveFilter ? 'No orders match this filter' : 'No orders assigned yet'}>
          {hasActiveFilter
            ? 'Try a different status, or clear the filter to see every order assigned to you.'
            : 'Orders assigned to your business will appear here once an admin assigns one.'}
        </EmptyState>
      ) : (
        <OrdersTable items={query.data?.items ?? []} />
      )}

      {query.data ? (
        <Pagination
          page={query.data.page}
          pageSize={query.data.pageSize || DEFAULT_PAGE_SIZE}
          total={query.data.total}
          onPageChange={handlePageChange}
        />
      ) : null}
    </div>
  )
}
