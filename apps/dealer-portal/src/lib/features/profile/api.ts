/**
 * Fetchers for the dealer-facing `dealer_org_rbac` profile/capabilities routes, via the BFF
 * proxy's JSON client (`@gift/api-client`'s `request`). Both paths are already allowlisted in
 * `src/lib/http/allowlist.ts` (owned by lane A / P2-UI-01) — verified by reading that file
 * directly before writing this: `dealer_org_rbac/dealer/profile` (GET) and
 * `dealer_org_rbac/dealer/profile/capabilities` (PUT) are both already present, so no allowlist
 * change was needed for this task.
 *
 * There is no dealer-facing endpoint to edit business-identity fields (`businessName`,
 * `contactEmail`, `phone`, `businessType`, `city`, `state`, `pincode`) post-approval — see
 * API-CONTRACTS.md's "Business-profile edit scope" — so this file exposes exactly two calls:
 * read the profile, and replace capabilities. There is deliberately no identity-update function
 * here for anything to accidentally call.
 */
import { request } from '@gift/api-client'
import type { DealerCapabilitiesWire, DealerOrgProfile } from './types'

export async function fetchDealerOrgProfile(): Promise<DealerOrgProfile> {
  return request<DealerOrgProfile>('dealer_org_rbac/dealer/profile')
}

/** Body must already match `capabilitiesUpsertSchema` exactly — build it with
 *  `buildCapabilitiesPayload` (validators.ts), never assembled ad hoc at the call site. */
export async function saveDealerCapabilities(payload: Record<string, unknown>): Promise<DealerCapabilitiesWire> {
  return request<DealerCapabilitiesWire>('dealer_org_rbac/dealer/profile/capabilities', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}
