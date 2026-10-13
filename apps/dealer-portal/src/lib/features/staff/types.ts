/**
 * Types for `dealer_org_rbac`'s dealer-facing staff roster/invite/deactivate surface
 * (FEAT-009, P2-UI-07). Verified directly against the real route/validator/openapi source
 * (not guessed):
 *
 *   - `apps/mercato/src/modules/dealer_org_rbac/lib/staffDirectory.ts`'s `DealerOrgUser` —
 *     the exact shape `GET .../dealer/staff` returns per roster row.
 *   - `apps/mercato/src/modules/dealer_org_rbac/api/openapi.ts`'s `dealerStaffMemberWireSchema`
 *     / `staffListResponseSchema` / `staffInviteResponseSchema` / `staffDeactivateResponseSchema`.
 *   - `apps/mercato/src/modules/dealer_org_rbac/data/validators.ts`'s `staffInviteSchema`
 *     (`.strict()` — email + optional name only).
 *
 * `DealerStaffMember.isActive` mirrors `User.isConfirmed` — the SAME flag the auth module's
 * session-integrity check re-validates on every request (see `staffDirectory.ts`'s own doc
 * comment). There is deliberately no third "invited / pending" state here: `auth.users.create`
 * always sets `isConfirmed: true` at creation time (verified in
 * `@open-mercato/core/modules/auth/commands/users.ts`), so a freshly-invited staff user is
 * already "Active" from the backend's point of view the instant the invite succeeds — the
 * backend has no notion of "invited but hasn't set a password yet" distinct from "active".
 * Never invent a pending/invited badge the real roster endpoint cannot back up.
 */
import type { DealerRole } from '@/components/layout/nav-items'

export type { DealerRole }

/** One row of `GET .../dealer_org_rbac/dealer/staff`'s `items[]` — the org's owner + staff roster. */
export interface DealerStaffMember {
  id: string
  email: string
  name: string | null
  role: DealerRole
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string | null
}

export interface StaffListResponse {
  items: DealerStaffMember[]
}

/** POST .../dealer/staff/invite response. See errors.ts for why this app never reads `userId`
 *  off this response to update local state — it always refetches the roster instead. */
export interface StaffInviteResponse {
  userId: string
  email: string
}

export interface StaffDeactivateResponse {
  userId: string
  deactivated: true
}

/** Local in-progress invite form state. */
export interface InviteFormValues {
  email: string
  name: string
}

export type FieldErrors = Record<string, string>
