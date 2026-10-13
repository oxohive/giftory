/**
 * Access gate for the onboarding/KYC screens (registration status, document upload/replacement,
 * rejection + resubmission) — deliberately distinct from `requireApprovedDealer()`/`requireRole()`
 * (TASK-04's `@/lib/auth/guard.ts`). Those redirect a pending/rejected dealer to `/pending` —
 * exactly the account state these screens exist to serve, so reusing them here would make the
 * screens this task builds unreachable. Instead this reuses TASK-04's own session resolution
 * (`getDealerAccess`, `@/lib/auth/session.ts` — imported, never edited) for the cookie/refresh
 * plumbing, and only supplies a different ROUTING decision for the states guard.ts doesn't need:
 * `pending`/`rejected`/`approved` are all allowed to reach these screens (not redirected to
 * `/pending`), while `unauthenticated`/`not-a-dealer`/`no-profile`/`error` still fail closed the
 * same way guard.ts's decisions do.
 *
 * Split into a pure decision function (`decideOnboardingAccess`, no Next/cookies — unit-tested
 * with real `DealerAccessState` fixtures, the same type TASK-04 defined and tests against in
 * `apps/dealer-portal/tests/access.test.mjs`) and a thin server wrapper
 * (`requireOnboardingAccess`) that actually calls `redirect()` — mirrors this app's established
 * access.ts/guard.ts split.
 */
import type { DealerAccessState } from '@/lib/auth/access'

export type OnboardingAccess =
  | { kind: 'pending'; kycStatus: 'pending_verification' | 'under_review' }
  | { kind: 'rejected'; rejectionReason: string | null }
  | { kind: 'approved' }

export type OnboardingAccessDecision =
  | { allow: true; access: OnboardingAccess }
  | { allow: false; redirectTo: string }

function loginRedirect(returnTo: string): string {
  const params = new URLSearchParams()
  if (returnTo && returnTo !== '/') params.set('returnTo', returnTo)
  const qs = params.toString()
  return qs ? `/login?${qs}` : '/login'
}

export function decideOnboardingAccess(state: DealerAccessState, returnTo: string): OnboardingAccessDecision {
  switch (state.kind) {
    case 'unauthenticated':
      return { allow: false, redirectTo: loginRedirect(returnTo) }
    case 'error':
      return { allow: false, redirectTo: loginRedirect(returnTo) }
    case 'not-a-dealer':
      return { allow: false, redirectTo: '/access-denied?reason=not-a-dealer' }
    case 'no-profile':
      return { allow: false, redirectTo: '/access-denied?reason=no-profile' }
    case 'pending':
      return { allow: true, access: { kind: 'pending', kycStatus: state.kycStatus } }
    case 'rejected':
      return { allow: true, access: { kind: 'rejected', rejectionReason: state.rejectionReason } }
    case 'approved':
      return { allow: true, access: { kind: 'approved' } }
  }
}

/**
 * Where a non-rejected caller should land instead of `/onboarding/resubmit` (that page only
 * makes sense for a rejected application — the backend's own resubmit route 400s otherwise).
 */
export function resubmitRedirectFor(access: OnboardingAccess): string | null {
  if (access.kind === 'rejected') return null
  return access.kind === 'approved' ? '/' : '/onboarding/status'
}
