import type { Metadata } from 'next'
import { RegisterForm } from '@/components/onboarding/RegisterForm'

export const metadata: Metadata = { title: 'Become a dealer' }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Public, unauthenticated registration screen (`POST .../dealer/onboarding/register` is
 * `requireAuth:false` — API-CONTRACTS.md). No onboarding/access gate here by design: there is
 * no session yet to resolve.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string; org?: string }>
}) {
  const params = await searchParams
  const raw = params.organizationId ?? params.org ?? ''
  const organizationId = UUID_PATTERN.test(raw) ? raw : null

  return <RegisterForm organizationId={organizationId} />
}
