import type { Metadata } from 'next'
import { PortalShell } from '@/components/layout/PortalShell'
import { requireApprovedDealer } from '@/lib/auth/guard'
import { DashboardContent } from '@/components/dashboard/DashboardContent'

export const metadata: Metadata = { title: 'Dashboard' }

/**
 * `/` — the dealer dashboard (P2-UI-08). Gated by `requireApprovedDealer()` (P2-UI-04's public
 * contract — see tasks/phase-2-ui/CONTRACT-HANDOFF.md "pending-KYC holding page" freeze: this
 * page consumes that gate rather than re-implementing the kycStatus check itself). Mounts the
 * shared `PortalShell` with the resolved role, per P2-UI-04's own documented integration example.
 */
export default async function DashboardPage() {
  const { role } = await requireApprovedDealer()
  return (
    <PortalShell role={role}>
      <DashboardContent role={role} />
    </PortalShell>
  )
}
