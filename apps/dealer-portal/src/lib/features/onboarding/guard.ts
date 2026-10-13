import 'server-only'
import { redirect } from 'next/navigation'
import { getDealerAccess } from '@/lib/auth/session'
import { decideOnboardingAccess, type OnboardingAccess } from './access'

/**
 * Server-side gate every onboarding page calls before rendering — see access.ts's module doc
 * comment for why this is not `requireApprovedDealer()`. `returnTo` should be the page's own
 * path so a signed-out visit returns there after login.
 */
export async function requireOnboardingAccess(returnTo: string): Promise<OnboardingAccess> {
  const state = await getDealerAccess()
  const decision = decideOnboardingAccess(state, returnTo)
  if (!decision.allow) redirect(decision.redirectTo)
  return decision.access
}
