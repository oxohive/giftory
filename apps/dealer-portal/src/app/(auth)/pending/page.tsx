import { StatusBadge } from '@gift/ui'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LogoutButton } from '@/components/auth/LogoutButton'
import { decideAccess } from '@/lib/auth/access'
import { getDealerAccess } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Application status' }

/**
 * The pending-KYC holding page CONTRACT-HANDOFF.md freezes: "a dealer who registers and logs in
 * before approval needs *something* to see other than a 404/403" — and the "TASK-04 owns this
 * gate; TASK-08 (dashboard) consumes it rather than re-implementing it" freeze. Every protected
 * page calls `requireApprovedDealer()` (guard.ts), which redirects a pending/rejected dealer
 * here rather than rendering a holding state inline on every page.
 */
export default async function PendingPage() {
  const access = await getDealerAccess()
  if (access.kind === 'approved') redirect('/')
  if (access.kind !== 'pending' && access.kind !== 'rejected') {
    const decision = decideAccess(access)
    redirect(decision.allow ? '/' : decision.redirectTo ?? '/login')
  }

  const isRejected = access.kind === 'rejected'
  const kycStatus = isRejected ? 'rejected' : access.kycStatus

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Application status</h1>
        <p className="text-sm text-muted-foreground">
          {isRejected
            ? 'Your dealer application was not approved.'
            : 'Your dealer application is being reviewed. We will email you once a decision is made.'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Status</span>
        <StatusBadge value={kycStatus} />
      </div>
      {isRejected ? (
        <>
          <p className="text-sm text-foreground">
            {access.rejectionReason ? `Reason: ${access.rejectionReason}` : 'No reason was provided.'}
          </p>
          {/* /onboarding/resubmit is TASK-05's (dealer registration and KYC screens) to build —
              not yet implemented as of this task; the CTA links there regardless since it's the
              documented destination (`POST .../onboarding/resubmit`), not a guessed one. */}
          <Link
            href="/onboarding/resubmit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Resubmit application
          </Link>
        </>
      ) : null}
      <LogoutButton className="justify-self-start" />
    </div>
  )
}
