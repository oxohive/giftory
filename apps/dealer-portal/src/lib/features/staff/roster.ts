/**
 * Pure roster helpers — no DOM/Next/fetch — so the "who can be deactivated, and who is the
 * caller's own row" decisions are unit-testable (tests/staff-roster.test.mjs) without mounting a
 * component.
 *
 * `canDeactivate` is deliberately role-based, not id-based, even though CONTRACT-HANDOFF.md's own
 * phrasing ("the roster's `id` field lets the UI detect this") suggests comparing the caller's
 * own user id. This app has no reliable client-visible "my own user id" today (`GET /api/auth/
 * profile` returns `email`/`name`/`roles`, never `id` — verified in `lib/auth/backend.ts`'s
 * `AuthProfileOutcome`), so this file uses the stronger, backend-verified invariant instead:
 * `executeStaffDeactivate` resolves its target via `findDealerStaffUser` (`staffDirectory.ts`),
 * which ONLY ever matches a `dealer:staff` row — never a `dealer:owner`, even one in the same org
 * (see that file's own test, `staffDirectory.test.ts`'s "never resolves a dealer:owner through
 * this lookup, even the one in the same org"). Since the `/staff` page itself is owner-only
 * (`requireRole(['dealer:owner'])`), the caller viewing this page is always the one `dealer:owner`
 * row, so "never show Deactivate on any dealer:owner row" and "never show Deactivate on the
 * caller's own row" are the exact same rule here — and this version is correct even in the
 * (currently unused) hypothetical of a second owner account, where an id-based check alone could
 * still render a button that would always 404 server-side.
 *
 * Deactivating an already-inactive user is additionally hidden (not merely a cosmetic choice:
 * calling it again is harmless — `auth.users.update` just re-applies `isConfirmed: false` — but
 * showing a "Deactivate" action on a row already showing "Deactivated" is confusing, not honest
 * UI).
 */
import type { DealerStaffMember } from './types'

export function canDeactivate(member: DealerStaffMember): boolean {
  return member.role === 'dealer:staff' && member.isActive
}

export function isOwner(member: DealerStaffMember): boolean {
  return member.role === 'dealer:owner'
}

/** Splits the roster into its one (expected) owner row and every staff row, preserving the
 *  server's own order within `staff`. Multiple/zero owner rows are passed through rather than
 *  thrown on — the real roster endpoint does not guarantee exactly one, and this file must not
 *  crash a render over that. */
export function splitRoster(items: DealerStaffMember[]): { owners: DealerStaffMember[]; staff: DealerStaffMember[] } {
  const owners: DealerStaffMember[] = []
  const staff: DealerStaffMember[] = []
  for (const member of items) {
    if (isOwner(member)) owners.push(member)
    else staff.push(member)
  }
  return { owners, staff }
}
