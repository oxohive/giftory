import type { Metadata } from 'next'
import { requireApprovedDealer } from '@/lib/auth/guard'
import { PortalShell } from '@/components/layout/PortalShell'
import { ProfileView } from '@/components/profile/ProfileView'

export const metadata: Metadata = { title: 'Profile' }

/**
 * `/profile` — visible to both roles. `dealer_org.view` (the feature backing this page's one
 * GET) is granted to `dealer:owner` AND `dealer:staff` per CONTRACT-HANDOFF.md's permission
 * matrix; only the capabilities EDIT surface (`/profile/capabilities`, `dealer_org.
 * manage_capabilities`) is owner-only, gated separately on that route. See ProfileView's own doc
 * comment for the full reasoning, including the one place CONTRACT-HANDOFF.md itself is
 * ambiguous about this (its "Route groups" table vs. its "Permission matrix" section).
 */
export default async function ProfilePage() {
  const { role } = await requireApprovedDealer({ returnTo: '/profile' })
  return (
    <PortalShell role={role}>
      <ProfileView role={role} />
    </PortalShell>
  )
}
