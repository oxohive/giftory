import Link from 'next/link'
import { ErrorNotice, LoadingState, cn, formatDate } from '@gift/ui'
import { orderListHref } from '@/lib/features/dashboard/links'
import type { DashboardAggregate, DashboardCountKey } from '@/lib/features/dashboard/types'

interface CardDef {
  key: DashboardCountKey
  label: string
  helpText: string
}

const CARDS: CardDef[] = [
  { key: 'pendingAcknowledgment', label: 'Pending acknowledgment', helpText: 'Newly assigned, awaiting acknowledgment' },
  { key: 'inProduction', label: 'In production', helpText: 'Currently being fulfilled' },
  { key: 'dispatchedThisWeek', label: 'Dispatched this week', helpText: '' },
]

/**
 * The three count cards — sourced ONLY from the real `GET .../dealer_orders/dealer/dashboard`
 * aggregate (never computed client-side from a page of `GET .../dealer/orders`, which would
 * silently undercount past the first page). Each card links to the orders list pre-filtered by
 * the exact `status` the backend counted (`orderListHref`) — see links.ts.
 */
export function StatusCountCards({
  data,
  isLoading,
  isError,
  errorMessage,
  onRetry,
}: {
  data?: DashboardAggregate
  isLoading: boolean
  isError: boolean
  errorMessage?: string
  onRetry: () => void
}) {
  if (isLoading) return <LoadingState label="Loading order counts…" />
  if (isError) return <ErrorNotice message={errorMessage ?? 'Could not load order counts.'} onRetry={onRetry} />
  if (!data) return null

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {CARDS.map((card) => (
        <Link
          key={card.key}
          href={orderListHref(card.key)}
          className={cn(
            'rounded-lg border border-border bg-surface p-5 transition-colors',
            'hover:border-primary/50 hover:bg-surface-muted',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          )}
        >
          <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{data[card.key]}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {card.key === 'dispatchedThisWeek' ? `Since ${formatDate(data.weekStartsAt)} (${data.timezone})` : card.helpText}
          </p>
        </Link>
      ))}
    </div>
  )
}
