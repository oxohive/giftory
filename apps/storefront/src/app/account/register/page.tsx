import type { Metadata } from 'next'
import { RegisterForm } from '@/components/account/register-form'

export const metadata: Metadata = { title: 'Create account', robots: { index: false } }

export default function RegisterPage() {
  return (
    <div className="container-page flex justify-center py-12">
      <RegisterForm />
    </div>
  )
}
