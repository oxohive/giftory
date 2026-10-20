import type { Metadata } from 'next'
import Link from 'next/link'
import { DocumentUploadPanel } from '@/components/onboarding/DocumentUploadPanel'
import { requireOnboardingAccess } from '@/lib/features/onboarding/guard'

export const metadata: Metadata = { title: 'KYC documents' }

export default async function OnboardingDocumentsPage() {
  await requireOnboardingAccess('/onboarding/documents')

  return (
    <div className="grid gap-4">
      <DocumentUploadPanel />
      <Link href="/onboarding/status" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to application status
      </Link>
    </div>
  )
}
