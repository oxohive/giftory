import type { Metadata } from 'next'
import { ApplicationStatus } from '@/components/onboarding/ApplicationStatus'
import { requireOnboardingAccess } from '@/lib/features/onboarding/guard'

export const metadata: Metadata = { title: 'Application status' }

export default async function OnboardingStatusPage() {
  await requireOnboardingAccess('/onboarding/status')

  return <ApplicationStatus />
}
