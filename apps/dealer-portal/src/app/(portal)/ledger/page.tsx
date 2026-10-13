import type { Metadata } from 'next'
import { requireRole } from '@/lib/auth/guard'
import { PortalShell } from '@/components/layout/PortalShell'
import { LedgerView } from '@/components/finance/LedgerView'

export const metadata: Metadata = { title: 'Ledger' }

/**
 * Owner-only, same gate as `/earnings` — `payouts.dealer_access` is also `dealer:owner`-only by
 * design (FEAT-009). See earnings/page.tsx's doc comment for the full reasoning; this page is not
 * in the frozen top-level nav (CONTRACT-HANDOFF.md lists a single combined "Earnings" nav entry)
 * but is linked to directly from `/earnings` for the full append-only transaction log.
 */
export default async function LedgerPage() {
  const { role } = await requireRole(['dealer:owner'], { returnTo: '/ledger' })
  return (
    <PortalShell role={role}>
      <LedgerView />
    </PortalShell>
  )
}
