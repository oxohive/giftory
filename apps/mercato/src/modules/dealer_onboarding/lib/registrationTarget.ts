import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { DealerProfile } from '../data/entities'

/**
 * Minimal shape of the installed `directory` module's Organization row that
 * the registration-target check reads. Kept structural so the check can be
 * unit-tested without the installed entity class.
 */
export type RegistrationOrganizationRow = {
  id: string
  tenant?: string | { id?: string | null } | null
  isActive?: boolean | null
  parentId?: string | null
  deletedAt?: Date | null
}

export type RegistrationTarget = { tenantId: string; marketplaceOrganizationId: string }

/**
 * Why an invite-link organization was rejected. Internal only — the route
 * MUST collapse every reason into the same `404 org_not_found` response so
 * the unauthenticated register endpoint cannot be used to learn anything
 * about an organization id (exists? is it a dealer? is it inactive?).
 */
export type RegistrationTargetRejection =
  | 'not_found'
  | 'no_tenant'
  | 'inactive'
  | 'not_root'
  | 'dealer_organization'

export type RegistrationTargetResult =
  | { ok: true; target: RegistrationTarget }
  | { ok: false; reason: RegistrationTargetRejection }

function readTenantId(org: RegistrationOrganizationRow): string | null {
  const tenant = org.tenant
  if (typeof tenant === 'string') return tenant.length > 0 ? tenant : null
  const id = tenant?.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

/**
 * Pure eligibility rules for the organization named in a dealer invite link
 * (`/onboarding/register?organizationId=<root-org-id>`, see CLAUDE.md and
 * docs/architecture.md §7.0). That id is only a pointer used to resolve the
 * tenant the new dealer is created under; it must be the marketplace's own
 * root organization, not an arbitrary org in the database:
 *
 * - it must exist and not be soft-deleted;
 * - it must belong to a tenant;
 * - it must be active (pending dealer orgs are created `isActive: false`);
 * - it must be a ROOT organization (`parentId` null) — the documented invite
 *   link format points at the root org;
 * - it must NOT be a dealer organization (ADR-003: an org with any
 *   `dealer_profiles` row, live or soft-deleted, is a dealer org). Dealer orgs
 *   are also root + active once approved, so this is the check that stops a
 *   dealer from using their OWN org id as an invite link.
 */
export function evaluateRegistrationOrganization(
  org: RegistrationOrganizationRow | null | undefined,
  isDealerOrganization: boolean,
): RegistrationTargetResult {
  if (!org || org.deletedAt) return { ok: false, reason: 'not_found' }
  const tenantId = readTenantId(org)
  if (!tenantId) return { ok: false, reason: 'no_tenant' }
  if (org.isActive === false) return { ok: false, reason: 'inactive' }
  if (org.parentId) return { ok: false, reason: 'not_root' }
  if (isDealerOrganization) return { ok: false, reason: 'dealer_organization' }
  return { ok: true, target: { tenantId, marketplaceOrganizationId: String(org.id) } }
}

/**
 * Resolves the tenant for an unauthenticated dealer registration from the
 * invite link's `organizationId` (known gap 7 hardening). Returns a
 * rejection reason instead of throwing so the caller can respond uniformly.
 *
 * `loadOrganization` is injected so the route can keep using the installed
 * `directory` module's entity without this module importing it statically.
 */
export async function resolveRegistrationTarget(
  em: EntityManager,
  organizationId: string,
  loadOrganization: (em: EntityManager, organizationId: string) => Promise<RegistrationOrganizationRow | null>,
): Promise<RegistrationTargetResult> {
  const org = await loadOrganization(em, organizationId)
  const preliminary = evaluateRegistrationOrganization(org, false)
  if (!preliminary.ok) return preliminary

  // Only look for a dealer profile once the org is otherwise eligible, and
  // scope that lookup to the org's own tenant. Soft-deleted profiles count:
  // an org that was ever a dealer org never becomes an invite target.
  const dealerProfile = await em.findOne(DealerProfile, {
    organizationId: preliminary.target.marketplaceOrganizationId,
    tenantId: preliminary.target.tenantId,
  } as FilterQuery<DealerProfile>)
  return evaluateRegistrationOrganization(org, Boolean(dealerProfile))
}
