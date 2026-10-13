import Link from 'next/link'
import { EmptyState, ErrorNotice, LoadingState, StatusBadge, formatDateTime } from '@gift/ui'
import type { Assignment } from '@/lib/features/dashboard/types'

/**
 * "Recent activity" has no dedicated backend aggregate (API-CONTRACTS.md's Dashboard-aggregates
 * section only covers the three counts). The only honest source for "what happened lately" is
 * the real, already-implemented order list (`GET .../dealer_orders/dealer/orders`, sorted by
 * `assignedAt desc`, a small fixed page) — never a synthetic/fabricated entry. Links to the order
 * detail by ASSIGNMENT id (`item.id`), per API-CONTRACTS.md's resolved "assignment-ID vs
 * order-ID" question — `orderId` is read-only reference data shown for context only.
 */
export function RecentActivityCard({
  items,
  isLoading,
  isError,
  errorMessage,
  onRetry,
}: {
  items?: Assignment[]
  isLoading: boolean
  isError: boolean
  errorMessage?: string
  onRetry: () => void
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-5" aria-labelledby="recent-activity-heading">
      <h2 id="recent-activity-heading" className="text-base font-semibold text-foreground">
        Recent activity
      </h2>
      <div className="mt-4">
        {isLoading ? <LoadingState label="Loading recent activity…" /> : null}
        {isError ? <ErrorNotice message={errorMessage ?? 'Could not load recent activity.'} onRetry={onRetry} /> : null}
        {!isLoading && !isError && items && items.length === 0 ? (
          <EmptyState title="No orders yet">Assigned orders will show up here as soon as you have one.</EmptyState>
        ) : null}
        {!isLoading && !isError && items && items.length > 0 ? (
          <ul className="grid gap-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <Link
                    href={`/orders/${item.id}`}
                    title={`Order ${item.orderId}`}
                    className="truncate text-sm font-medium text-foreground hover:underline"
                  >
                    Order {item.orderId.slice(0, 8)}
                  </Link>
                  <p className="text-xs text-muted-foreground">Assigned {formatDateTime(item.assignedAt)}</p>
                </div>
                <StatusBadge value={item.status} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}
