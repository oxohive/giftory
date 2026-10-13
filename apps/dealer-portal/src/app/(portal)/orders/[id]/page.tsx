import type { Metadata } from 'next'
import { PortalShell } from '@/components/layout/PortalShell'
import { requireApprovedDealer } from '@/lib/auth/guard'
import { OrderDetailView } from '@/components/orders/detail/OrderDetailView'

export const metadata: Metadata = { title: 'Order detail' }

/**
 * `/orders/[id]` — order detail + production-status update (TASK-10). `[id]` is the ASSIGNMENT
 * id, not the sales order id (CONTRACT-HANDOFF.md's route table; `/orders` (TASK-09) already
 * links here with the assignment id). Visible to both `dealer:owner` and `dealer:staff` — same
 * role-agnostic gate as `/orders`, since `dealer_orders.dealer_access` is granted to both roles.
 *
 * No `<Suspense>` boundary is needed here (unlike `/orders`): this page takes its identity from
 * the route param, not from `useSearchParams()`.
 */
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { role } = await requireApprovedDealer({ returnTo: `/orders/${id}` })
  return (
    <PortalShell role={role}>
      <OrderDetailView assignmentId={id} />
    </PortalShell>
  )
}
