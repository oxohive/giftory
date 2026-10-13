'use client'

import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '@gift/api-client'
import { ErrorNotice, LoadingState, PermissionDenied, SessionExpired } from '@gift/ui'
import type { DealerRole } from '@/components/layout/nav-items'
import { fetchDealerOrgProfile } from '@/lib/features/profile/api'
import { BusinessProfileCard } from './BusinessProfileCard'
import { CapabilitiesSummaryCard } from './CapabilitiesSummaryCard'

/**
 * `/profile` — read-only business profile + a read-only capabilities summary with an
 * owner-only entry point into the editable `/profile/capabilities` screen.
 *
 * Visible to BOTH roles (unlike `/earnings`/`/staff`, which are owner-only pages): per
 * CONTRACT-HANDOFF.md's "Permission matrix" section (the one this task's own briefing points at
 * for this exact question, as distinct from that same document's separate "Route groups" table,
 * which lists this route's role informally as "owner" without cross-referencing the matrix) —
 * `dealer_org.view`, the feature this page's one GET depends on, is granted to BOTH
 * `dealer:owner` and `dealer:staff`. Only `dealer_org.manage_capabilities` (the edit surface,
 * gated separately on `/profile/capabilities`) is owner-only. The page component one level up
 * therefore calls `requireApprovedDealer()`, not `requireRole(['dealer:owner'])` — a staff caller
 * sees this same screen, with no edit entry point rendered (`CapabilitiesSummaryCard` checks
 * `role` itself), not a `/forbidden` redirect for a route they are actually allowed to view.
 */
export function ProfileView({ role }: { role: DealerRole }) {
  const router = useRouter()
  const query = useQuery({ queryKey: ['dealer-org-profile'], queryFn: fetchDealerOrgProfile, retry: false })

  if (query.isLoading) return <LoadingState label="Loading your profile…" />

  if (query.isError) {
    const err = query.error
    if (err instanceof ApiError && err.isUnauthorized) {
      return <SessionExpired onSignIn={() => router.push('/login')} />
    }
    if (err instanceof ApiError && err.isForbidden) {
      return <PermissionDenied message="You do not have permission to view this organization's profile." />
    }
    const message = err instanceof Error ? err.message : 'Could not load your profile.'
    return <ErrorNotice message={message} onRetry={() => void query.refetch()} />
  }

  const profile = query.data
  if (!profile) return null

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Profile</h1>
        <p className="text-sm text-muted-foreground">Your business profile and production capabilities.</p>
      </div>

      <BusinessProfileCard profile={profile} />
      <CapabilitiesSummaryCard capabilities={profile.capabilities} role={role} />
    </div>
  )
}
