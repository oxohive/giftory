'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@gift/api-client'
import { Button, EmptyState, ErrorNotice, LoadingState, PermissionDenied, SessionExpired } from '@gift/ui'
import { fetchStaffRoster } from '@/lib/features/staff/api'
import { splitRoster } from '@/lib/features/staff/roster'
import type { DealerStaffMember } from '@/lib/features/staff/types'
import { OwnerCard } from './OwnerCard'
import { StaffTable } from './StaffTable'
import { InviteStaffDialog } from './InviteStaffDialog'
import { DeactivateStaffDialog } from './DeactivateStaffDialog'

const ROSTER_QUERY_KEY = ['dealer-staff-roster']

/**
 * `/staff` — owner-only (gated one level up by `requireRole(['dealer:owner'])`). Backed by
 * `GET .../dealer/staff`, `POST .../dealer/staff/invite`, `POST .../dealer/staff/{id}/deactivate`
 * — all three already-implemented, already-tested lifecycle endpoints (P2-UI-03). This component
 * adds no backend logic of its own.
 *
 * Mutation discipline mirrors `CapabilitiesEditView` (P2-UI-06): neither a successful invite nor
 * a successful deactivation paints an optimistic local change. Both invalidate and refetch the
 * real roster and let that response be the only source of truth for what's on screen — so "send
 * an invite, see the new row" and "deactivate someone, see their status flip" are backed by a
 * real round trip, never a client-side guess that could drift from what the server actually
 * persisted.
 */
export function StaffListView() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ROSTER_QUERY_KEY, queryFn: fetchStaffRoster, retry: false })

  const [inviteOpen, setInviteOpen] = useState(false)
  const [deactivateTarget, setDeactivateTarget] = useState<DealerStaffMember | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeRef = useRef<HTMLParagraphElement>(null)

  // The h1 renders in every state so the page always has a heading (WCAG 1.3.1, 2.4.6).
  const header = (action?: ReactNode) => (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Staff</h1>
        <p className="text-sm text-muted-foreground">
          Invite teammates to help manage orders, or deactivate someone who should no longer
          have access.
        </p>
      </div>
      {action}
    </div>
  )

  if (query.isLoading || query.isError || !query.data) {
    const err = query.error
    let body: ReactNode = null
    if (query.isLoading) body = <LoadingState label="Loading your staff…" />
    else if (err instanceof ApiError && err.isUnauthorized) body = <SessionExpired onSignIn={() => router.push('/login')} />
    else if (err instanceof ApiError && err.isForbidden) {
      body = <PermissionDenied message="You do not have permission to manage this organization's staff." />
    } else if (query.isError) {
      const message = err instanceof Error ? err.message : 'Could not load your staff.'
      body = <ErrorNotice message={message} onRetry={() => void query.refetch()} />
    }
    return (
      <div className="grid gap-6">
        {header()}
        {body}
      </div>
    )
  }

  const roster = query.data

  const { owners, staff } = splitRoster(roster.items)

  async function refetchRoster() {
    await queryClient.invalidateQueries({ queryKey: ROSTER_QUERY_KEY })
    await query.refetch()
  }

  async function handleInvited(email: string) {
    setNotice(`Invitation sent to ${email}.`)
    await refetchRoster()
  }

  async function handleDeactivated(member: DealerStaffMember) {
    setDeactivateTarget(null)
    setNotice(`${member.email} has been deactivated and no longer has access.`)
    await refetchRoster()
    // The row's Deactivate button (where the dialog returned focus) no longer exists after the
    // refetch — move focus to the confirmation instead of letting it fall to <body> (2.4.3).
    requestAnimationFrame(() => noticeRef.current?.focus())
  }

  return (
    <div className="grid gap-6">
      {header(
        <Button
          type="button"
          onClick={() => {
            setNotice(null)
            setInviteOpen(true)
          }}
        >
          Invite staff
        </Button>,
      )}

      {/* Always-mounted (visually hidden) live region: screen readers only reliably announce text
          that changes inside an existing role=status container, not one inserted together with its
          text (WCAG 4.1.3). The visible notice below carries no role so it isn't read twice. */}
      <p role="status" className="sr-only">
        {notice ?? ''}
      </p>
      {notice ? (
        <p
          ref={noticeRef}
          tabIndex={-1}
          className="rounded-md border border-success/40 bg-success/10 p-3 text-sm text-foreground focus:outline-none focus-visible:outline-2 focus-visible:outline-ring"
        >
          {notice}
        </p>
      ) : null}

      {owners.length > 0 ? <OwnerCard owners={owners} /> : null}

      {staff.length === 0 ? (
        <EmptyState title="No staff invited yet">
          Invite a teammate to help manage orders. They&apos;ll get an email to set up their
          account.
        </EmptyState>
      ) : (
        <StaffTable members={staff} onDeactivate={(member) => setDeactivateTarget(member)} />
      )}

      <InviteStaffDialog open={inviteOpen} onOpenChange={setInviteOpen} onInvited={handleInvited} />
      <DeactivateStaffDialog
        member={deactivateTarget}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null)
        }}
        onDeactivated={handleDeactivated}
      />
    </div>
  )
}
