import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoginForm } from '@/components/account/login-form'

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } }

export default function LoginPage() {
  return (
    <div className="container-page flex justify-center py-12">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  )
}
