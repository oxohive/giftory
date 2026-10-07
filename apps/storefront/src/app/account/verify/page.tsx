import type { Metadata } from 'next'
import { VerifyEmail } from '@/components/account/verify-email'

export const metadata: Metadata = { title: 'Verify email', robots: { index: false } }

/**
 * Landing page for the signup verification link. NOTE: Open Mercato builds that link to its own
 * portal (`{APP_URL}/{orgSlug}/portal/verify?token=` or the org's custom domain); pointing it here
 * needs backend config — see docs/backend-api-contract.md section 3.
 */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  return (
    <div className="container-page flex justify-center py-12">
      <VerifyEmail token={typeof token === 'string' ? token : null} />
    </div>
  )
}
