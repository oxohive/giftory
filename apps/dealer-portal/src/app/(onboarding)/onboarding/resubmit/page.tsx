import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ResubmitForm } from '@/components/onboarding/ResubmitForm'
import { resubmitRedirectFor } from '@/lib/features/onboarding/access'
import { requireOnboardingAccess } from '@/lib/features/onboarding/guard'

export const metadata: Metadata = { title: 'Resubmit application' }

/**
 * `/onboarding/resubmit` — the exact path TASK-04's `/pending` page already links to for a
 * rejected applicant (see that page's own doc comment). Server-side-redirects a caller whose
 * application is NOT currently rejected (pending/under_review -> status page; approved ->
 * dashboard) rather than rendering a form the backend would 400 on (`executeResubmit` only
 * allows `kycStatus === 'rejected'`).
 */
export default async function OnboardingResubmitPage() {
  const access = await requireOnboardingAccess('/onboarding/resubmit')
  const redirectTo = resubmitRedirectFor(access)
  if (redirectTo) redirect(redirectTo)

  return <ResubmitForm />
}
