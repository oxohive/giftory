import type { Metadata } from 'next'
import { requireRole } from '@/lib/auth/guard'
import { PortalShell } from '@/components/layout/PortalShell'
import { EarningsView } from '@/components/finance/EarningsView'

export const metadata: Metadata = { title: 'Earnings' }

/**
 * Owner-only per CONTRACT-HANDOFF.md's "Navigation entries" freeze and the permission matrix's
 * resolution of task 00's "owner vs staff earnings access" question: `commissions.dealer_access`
 * goes to `dealer:owner` only, by design (FEAT-009). `requireRole` redirects any other caller
 * (unauthenticated, not-a-dealer, pending/rejected KYC, or an authenticated `dealer:staff`) before
 * any earnings data is fetched — a staff caller lands on `/forbidden`, which explains why, rather
 * than a blank page or a raw 403.
 */
export default async function EarningsPage() {
  const { role } = await requireRole(['dealer:owner'], { returnTo: '/earnings' })
  return (
    <PortalShell role={role}>
      <EarningsView />
    </PortalShell>
  )
}
