import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoadingState } from '@gift/ui'
import { PortalShell } from '@/components/layout/PortalShell'
import { requireApprovedDealer } from '@/lib/auth/guard'
import { OrdersListView } from '@/components/orders/list/OrdersListView'

export const metadata: Metadata = { title: 'Orders' }

/**
 * `/orders` — the dealer's assigned-orders list (TASK-09). Visible to both `dealer:owner` and
 * `dealer:staff` (per CONTRACT-HANDOFF.md's permission matrix, `dealer_orders.dealer_access` is
 * granted to both roles — unlike earnings/ledger/staff, which are owner-only) — this page uses
 * the role-agnostic `requireApprovedDealer()` gate, not `requireRole`.
 *
 * `<Suspense>` is required here, not optional: `OrdersListView` calls `useSearchParams()` (to
 * read the page/status/sort state persisted in the URL) — the App Router requires a Suspense
 * boundary around any client component using that hook.
 */
export default async function OrdersPage() {
  const { role } = await requireApprovedDealer({ returnTo: '/orders' })
  return (
    <PortalShell role={role}>
      <Suspense fallback={<LoadingState label="Loading orders…" />}>
        <OrdersListView />
      </Suspense>
    </PortalShell>
  )
}
