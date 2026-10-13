import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LogoutButton } from '@/components/auth/LogoutButton'
import { decideAccess } from '@/lib/auth/access'
import { getDealerAccess } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Owner access required' }

/** Reached when `requireRole(['dealer:owner'])` (guard.ts) denies an authenticated, approved
 *  staff caller trying to hit an owner-only screen (e.g. /staff, /earnings) — a real server-side
 *  block, not a hidden nav item a staff user could still reach by typing the URL. */
export default async function ForbiddenPage() {
  const access = await getDealerAccess()
  if (access.kind !== 'approved') {
    const decision = decideAccess(access)
    redirect(decision.allow ? '/' : decision.redirectTo ?? '/login')
  }

  return (
    <div className="grid gap-4">
      <h1 className="text-lg font-semibold text-foreground">Owner access required</h1>
      <p className="text-sm text-muted-foreground">This section is only available to the business owner account.</p>
      <Link href="/" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to dashboard
      </Link>
      <LogoutButton className="justify-self-start" />
    </div>
  )
}
