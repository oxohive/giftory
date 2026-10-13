/**
 * Pure access-decision logic for the dealer portal — no Next/cookies/fetch here, so this module
 * runs under plain `node --test` with real contract fixtures instead of mocks of itself. The
 * Next-API-touching wrapper (session.ts/guard.ts) is deliberately thin glue around this.
 *
 * `DealerRole` is re-exported from nav-items.ts (TASK-01/lane A, components/layout/) rather than
 * redeclared, so the two never drift.
 */
import type { DealerRole } from '@/components/layout/nav-items'

export type { DealerRole }

export type DealerAccessState =
  /** No usable session: missing cookies, an invalid/expired token, or a refresh that failed.
   *  Also covers a user whose account was deactivated mid-session — the backend's own session-
   *  integrity check (re-run on every authenticated request) rejects a deactivated user with the
   *  same generic 401 as an expired token, by design (the core auth module never discloses
   *  account-existence/deactivation state through an authenticated-route response — see
   *  @open-mercato/core's auth AGENTS.md: "Never reveal whether an email exists through auth
   *  error messages"). This app deliberately does not try to tell "disabled" apart from
   *  "expired" for the same reason: doing so would require guessing at a distinction the backend
   *  intentionally does not expose, which is itself a disclosure risk. Both are handled the same
   *  explicit way — a real re-authentication prompt, never a raw error. */
  | { kind: 'unauthenticated'; reason?: 'expired' | 'signed-out' }
  /** The session is valid, but the account is not a dealer user at all (no dealer:owner/staff
   *  role) — e.g. an admin/staff login used by mistake. */
  | { kind: 'not-a-dealer' }
  /** A dealer role is granted, but no DealerProfile exists for the session's organization. */
  | { kind: 'no-profile' }
  | { kind: 'pending'; role: DealerRole; kycStatus: 'pending_verification' | 'under_review' }
  | { kind: 'rejected'; role: DealerRole; rejectionReason: string | null }
  | { kind: 'approved'; role: DealerRole }
  /** The backend could not be reached, or returned something unexpected — fail closed (never
   *  treat an unreadable response as approved) without claiming a specific account state we
   *  couldn't actually verify. */
  | { kind: 'error' }

export interface ProfileOutcome {
  ok: boolean
  roles: string[]
}

export interface OnboardingOutcome {
  status: 'ok' | 'not_found' | 'forbidden' | 'unauthorized' | 'error'
  kycStatus?: string
  rejectionReason?: string | null
}

const OWNER: DealerRole = 'dealer:owner'
const STAFF: DealerRole = 'dealer:staff'

function resolveRole(roles: string[]): DealerRole | null {
  if (roles.includes(OWNER)) return OWNER
  if (roles.includes(STAFF)) return STAFF
  return null
}

export function resolveDealerAccess(
  profile: ProfileOutcome | null,
  onboarding: OnboardingOutcome | null,
): DealerAccessState {
  if (!profile || !profile.ok) return { kind: 'unauthenticated' }

  const role = resolveRole(profile.roles)
  if (!role) return { kind: 'not-a-dealer' }

  if (!onboarding) return { kind: 'error' }
  if (onboarding.status === 'unauthorized') return { kind: 'unauthenticated' }
  if (onboarding.status === 'not_found') return { kind: 'no-profile' }
  if (onboarding.status === 'forbidden') return { kind: 'not-a-dealer' }
  if (onboarding.status === 'error') return { kind: 'error' }

  if (onboarding.kycStatus === 'approved') return { kind: 'approved', role }
  if (onboarding.kycStatus === 'rejected') {
    return { kind: 'rejected', role, rejectionReason: onboarding.rejectionReason ?? null }
  }
  const kycStatus = onboarding.kycStatus === 'under_review' ? 'under_review' : 'pending_verification'
  return { kind: 'pending', role, kycStatus }
}

export interface AccessDecision {
  allow: boolean
  redirectTo?: string
  role?: DealerRole
}

export interface DecideAccessOptions {
  /** Restrict to these roles (e.g. owner-only screens). Ignored unless the state is 'approved'. */
  requireRole?: DealerRole[]
  /** Where to send the user back to after signing in — sanitized by the caller before this is
   *  reached (see return-to.ts); this function only forwards it into the login query string. */
  returnTo?: string
}

function loginRedirect(reason: string | undefined, returnTo: string | undefined): string {
  const params = new URLSearchParams()
  if (returnTo && returnTo !== '/') params.set('returnTo', returnTo)
  if (reason) params.set('reason', reason)
  const qs = params.toString()
  return qs ? `/login?${qs}` : '/login'
}

export function decideAccess(state: DealerAccessState, options: DecideAccessOptions = {}): AccessDecision {
  switch (state.kind) {
    case 'unauthenticated':
      return { allow: false, redirectTo: loginRedirect(state.reason, options.returnTo) }
    case 'error':
      return { allow: false, redirectTo: loginRedirect('unavailable', options.returnTo) }
    case 'not-a-dealer':
      return { allow: false, redirectTo: '/access-denied?reason=not-a-dealer' }
    case 'no-profile':
      return { allow: false, redirectTo: '/access-denied?reason=no-profile' }
    case 'pending':
    case 'rejected':
      return { allow: false, redirectTo: '/pending' }
    case 'approved': {
      if (options.requireRole && options.requireRole.length > 0 && !options.requireRole.includes(state.role)) {
        return { allow: false, redirectTo: '/forbidden' }
      }
      return { allow: true, role: state.role }
    }
  }
}
