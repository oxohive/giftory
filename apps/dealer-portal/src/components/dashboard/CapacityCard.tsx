import Link from 'next/link'
import { Button, ErrorNotice, LoadingState } from '@gift/ui'
import type { DealerRole } from '@/components/layout/nav-items'
import type { CapacityView } from '@/lib/features/dashboard/types'

/**
 * "Available capacity" = `capabilities.maxDailyCapacity` from the already-correct
 * `GET .../dealer_org_rbac/dealer/profile` aggregate (API-CONTRACTS.md: TASK-08 composes this
 * client-side with the dealer_orders dashboard aggregate; no cross-module join exists or is
 * needed). Renders the honest "not configured" state rather than a fabricated "0 orders/day"
 * when the dealer has never set it — see lib/features/dashboard/queries.ts's `fetchCapacity`.
 * Only an owner can
 * edit capabilities (`dealer_org.manage_capabilities` — owner only, per CONTRACT-HANDOFF's
 * permission matrix), so the "set up capacity" CTA is owner-only; staff see the same read state
 * with no edit affordance they could not use anyway.
 */
export function CapacityCard({
  data,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  role,
}: {
  data?: CapacityView
  isLoading: boolean
  isError: boolean
  errorMessage?: string
  onRetry: () => void
  role: DealerRole
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-5" aria-labelledby="capacity-heading">
      <h2 id="capacity-heading" className="text-base font-semibold text-foreground">
        Available capacity
      </h2>
      <div className="mt-4">
        {isLoading ? <LoadingState label="Loading capacity…" /> : null}
        {isError ? <ErrorNotice message={errorMessage ?? 'Could not load capacity.'} onRetry={onRetry} /> : null}
        {!isLoading && !isError && data ? (
          data.configured ? (
            <p className="text-3xl font-semibold tabular-nums text-foreground">
              {data.maxDailyCapacity}
              <span className="ml-2 text-sm font-normal text-muted-foreground">orders / day</span>
            </p>
          ) : (
            <div className="grid gap-3">
              <p className="text-sm text-muted-foreground">Not configured yet.</p>
              {role === 'dealer:owner' ? (
                <Button asChild variant="outline" size="sm" className="justify-self-start">
                  <Link href="/profile/capabilities">Set up capacity</Link>
                </Button>
              ) : null}
            </div>
          )
        ) : null}
      </div>
    </section>
  )
}
