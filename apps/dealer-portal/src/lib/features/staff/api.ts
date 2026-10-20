/**
 * Fetchers for the dealer-facing `dealer_org_rbac` staff roster/invite/deactivate routes, via the
 * BFF proxy's JSON client (`@gift/api-client`'s `request`). All three paths were already
 * allowlisted in `src/lib/http/allowlist.ts` before this task started (verified by reading that
 * file directly, not assumed): `dealer_org_rbac/dealer/staff` (GET), `.../staff/invite` (POST),
 * and `.../staff/{id}/deactivate` (POST) — no allowlist change was needed.
 *
 * Every request/response body here is JSON (`staffInviteSchema`/`staffDeactivateSchema` are
 * plain `.strict()` zod objects, no file fields), so the shared proxy's `req.text()` body
 * handling is safe for this feature — no dedicated binary-passthrough route is needed (see
 * CONTRACT-HANDOFF.md's "shared BFF proxy cannot carry binary payloads" section, which does not
 * apply here).
 */
import { request } from '@gift/api-client'
import type { StaffDeactivateResponse, StaffInviteResponse, StaffListResponse } from './types'

export async function fetchStaffRoster(): Promise<StaffListResponse> {
  return request<StaffListResponse>('dealer_org_rbac/dealer/staff')
}

/** Body must already match `staffInviteSchema` exactly — build it with `buildInvitePayload`
 *  (validators.ts), never assembled ad hoc at the call site. */
export async function inviteStaffMember(payload: Record<string, unknown>): Promise<StaffInviteResponse> {
  return request<StaffInviteResponse>('dealer_org_rbac/dealer/staff/invite', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function deactivateStaffMember(userId: string): Promise<StaffDeactivateResponse> {
  return request<StaffDeactivateResponse>(`dealer_org_rbac/dealer/staff/${encodeURIComponent(userId)}/deactivate`, {
    method: 'POST',
  })
}
