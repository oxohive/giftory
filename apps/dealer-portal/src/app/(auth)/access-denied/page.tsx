import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LogoutButton } from '@/components/auth/LogoutButton'
import { getDealerAccess } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Access unavailable' }

const COPY: Record<string, string> = {
  'not-a-dealer':
    'This account is not registered as a dealer. Sign in with your dealer account, or contact your dealer administrator for an invite.',
  'no-profile': "We couldn't find a dealer application for this account. Contact support if you believe this is a mistake.",
}

export default async function AccessDeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const access = await getDealerAccess()
  if (access.kind === 'approved') redirect('/')
  if (access.kind === 'pending' || access.kind === 'rejected') redirect('/pending')
  if (access.kind === 'unauthenticated' || access.kind === 'error') redirect('/login')

  const { reason } = await searchParams
  const message = (reason && COPY[reason]) || "This account doesn't have access to the dealer portal."

  return (
    <div className="grid gap-4">
      <h1 className="text-lg font-semibold text-foreground">Access unavailable</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <LogoutButton className="justify-self-start" />
    </div>
  )
}
