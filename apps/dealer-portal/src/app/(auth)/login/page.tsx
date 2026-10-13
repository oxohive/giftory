import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/auth/LoginForm'
import { decideAccess } from '@/lib/auth/access'
import { sanitizeReturnTo } from '@/lib/auth/return-to'
import { getDealerAccess } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; reason?: string }>
}) {
  const params = await searchParams
  const returnTo = sanitizeReturnTo(params.returnTo)

  // Already have a usable session? Don't show the login form — route to wherever it belongs
  // (approved -> returnTo/dashboard, pending/rejected -> /pending, wrong account type -> the
  // access-denied page). Only 'unauthenticated' and 'error' fall through to actually render it.
  const access = await getDealerAccess()
  if (access.kind !== 'unauthenticated' && access.kind !== 'error') {
    const decision = decideAccess(access, { returnTo })
    redirect(decision.allow ? returnTo : decision.redirectTo ?? '/pending')
  }

  return <LoginForm returnTo={returnTo} reason={params.reason} />
}
