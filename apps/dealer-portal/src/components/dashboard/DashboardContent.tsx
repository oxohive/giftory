'use client'

import { useQuery } from '@tanstack/react-query'
import type { DealerRole } from '@/components/layout/nav-items'
import { fetchCapacity, fetchDashboardAggregate, fetchRecentActivity } from '@/lib/features/dashboard/queries'
import { CapacityCard } from './CapacityCard'
import { RecentActivityCard } from './RecentActivityCard'
import { StatusCountCards } from './StatusCountCards'

function messageOf(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined
}

/**
 * Three independent queries, three independent loading/error/retry states — a failure fetching
 * one section (e.g. the dashboard-aggregate endpoint, see queries.ts's documented allowlist
 * blocker) never blocks the other two from rendering their real data. Visible identically to
 * both `dealer:owner` and `dealer:staff` (dashboard counts and capacity are readable by both
 * roles per CONTRACT-HANDOFF's permission matrix — only the capacity "edit" CTA is owner-gated,
 * handled inside CapacityCard).
 */
export function DashboardContent({ role }: { role: DealerRole }) {
  // retry: false — the app-wide default (providers.tsx) retries queries automatically with
  // backoff, which is wrong here: a 401/403/404 (wrong session, missing grant, or — see
  // queries.ts's documented allowlist blocker — a route not yet reachable) will never succeed on
  // blind retry, and silently retrying for several seconds leaves the loading spinner showing
  // long after the real answer (an error) is already known. The explicit "Try again" button
  // (ErrorNotice's onRetry) is the one real retry mechanism this screen offers.
  const counts = useQuery({ queryKey: ['dashboard', 'counts'], queryFn: fetchDashboardAggregate, retry: false })
  const capacity = useQuery({ queryKey: ['dashboard', 'capacity'], queryFn: fetchCapacity, retry: false })
  const activity = useQuery({ queryKey: ['dashboard', 'activity'], queryFn: fetchRecentActivity, retry: false })

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Your order pipeline at a glance.</p>
      </div>

      <StatusCountCards
        data={counts.data}
        isLoading={counts.isLoading}
        isError={counts.isError}
        errorMessage={messageOf(counts.error)}
        onRetry={() => void counts.refetch()}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <RecentActivityCard
          items={activity.data?.items}
          isLoading={activity.isLoading}
          isError={activity.isError}
          errorMessage={messageOf(activity.error)}
          onRetry={() => void activity.refetch()}
        />
        <CapacityCard
          data={capacity.data}
          isLoading={capacity.isLoading}
          isError={capacity.isError}
          errorMessage={messageOf(capacity.error)}
          onRetry={() => void capacity.refetch()}
          role={role}
        />
      </div>
    </div>
  )
}
