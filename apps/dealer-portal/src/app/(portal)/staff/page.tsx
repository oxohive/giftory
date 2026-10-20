import type { Metadata } from 'next'
import { requireRole } from '@/lib/auth/guard'
import { PortalShell } from '@/components/layout/PortalShell'
import { StaffListView } from '@/components/staff/StaffListView'

export const metadata: Metadata = { title: 'Staff' }

/**
 * `/staff` — owner-only, per CONTRACT-HANDOFF.md's "Route groups"/"Navigation entries" freeze
 * and the real backend ACL (`dealer_org.manage_staff` is granted to `dealer:owner` only — see
 * `apps/mercato/src/modules/dealer_org_rbac/setup.ts`). A `dealer:staff` caller hitting this URL
 * directly is redirected to `/forbidden` by `requireRole` before any staff data is fetched —
 * mirrors `/profile/capabilities`'s (P2-UI-06) identical owner-only gate; "server authorization
 * is required regardless of hidden navigation" per the shared acceptance rule, and this page's
 * nav entry is already hidden from staff by `nav-items.ts`'s `rolesAllowed`.
 */
export default async function StaffPage() {
  const { role } = await requireRole(['dealer:owner'], { returnTo: '/staff' })
  return (
    <PortalShell role={role}>
      <StaffListView />
    </PortalShell>
  )
}
