import 'server-only'
import { cookies } from 'next/headers'
import { resolveDealerAccess, type DealerAccessState } from './access'
import { fetchAuthProfile, fetchOnboardingStatus, refreshAuthToken } from './backend'

/**
 * Resolves the caller's dealer access state for the CURRENT request, server-side, from the
 * incoming `auth_token`/`session_token` cookies. This is the one function every protected
 * Server Component should go through (directly, or via guard.ts's `requireApprovedDealer`/
 * `requireRole`) — it never trusts anything the client sends beyond those two httpOnly cookies.
 *
 * Thin by design: all of the actual branching lives in the pure, unit-tested `resolveDealerAccess`
 * (access.ts); this function only does the Next-specific plumbing (reading cookies, making the
 * two backend calls, refreshing once if only the long-lived session token is present) that
 * cannot be exercised outside a real Next request and therefore is not unit-tested directly —
 * see tests/backend.test.mjs (the calls this function makes) and tests/access.test.mjs (the
 * decisions built from their results) for where the real coverage lives.
 */
export async function getDealerAccess(): Promise<DealerAccessState> {
  const jar = await cookies()
  let authToken = jar.get('auth_token')?.value
  const sessionToken = jar.get('session_token')?.value

  if (!authToken && sessionToken) {
    const refreshed = await refreshAuthToken(sessionToken)
    if (refreshed) authToken = refreshed
  }

  if (!authToken) return { kind: 'unauthenticated' }

  const profile = await fetchAuthProfile(authToken)
  if (!profile.ok) return { kind: 'unauthenticated' }

  const onboarding = await fetchOnboardingStatus(authToken)
  return resolveDealerAccess(profile, onboarding)
}
