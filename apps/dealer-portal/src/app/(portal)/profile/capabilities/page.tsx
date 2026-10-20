import type { Metadata } from 'next'
import { requireRole } from '@/lib/auth/guard'
import { PortalShell } from '@/components/layout/PortalShell'
import { CapabilitiesEditView } from '@/components/profile/CapabilitiesEditView'

export const metadata: Metadata = { title: 'Edit capabilities' }

/**
 * `/profile/capabilities` — the one editable surface on the dealer profile, frozen by
 * CONTRACT-HANDOFF.md's "Route groups" table as its own route (not an inline edit on `/profile`).
 * Owner-only: `dealer_org.manage_capabilities` is granted to `dealer:owner` only, never
 * `dealer:staff` — a staff caller hitting this URL directly is redirected to `/forbidden` by
 * `requireRole` before any capabilities data is fetched, not merely hidden from nav (the
 * dashboard's `CapacityCard` and `/profile`'s `CapabilitiesSummaryCard` both already link here
 * only for an owner, but server authorization is required regardless of hidden navigation).
 */
export default async function CapabilitiesPage() {
  const { role } = await requireRole(['dealer:owner'], { returnTo: '/profile/capabilities' })
  return (
    <PortalShell role={role}>
      <CapabilitiesEditView />
    </PortalShell>
  )
}
