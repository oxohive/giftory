import type { Metadata } from 'next'
import { ResetPasswordForm } from '@/components/account/reset-password-form'

export const metadata: Metadata = { title: 'Set new password', robots: { index: false } }

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  return (
    <div className="container-page flex justify-center py-12">
      <ResetPasswordForm token={typeof token === 'string' ? token : null} />
    </div>
  )
}
