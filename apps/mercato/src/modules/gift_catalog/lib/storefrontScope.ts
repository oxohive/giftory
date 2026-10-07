import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import { getCustomerAuthFromRequest } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import type { GiftCatalogScope } from '../commands/shared'

/**
 * Trusted scope resolution for unauthenticated / customer-facing storefront
 * reads. Mirrors the platform's own pre-auth resolution
 * (`customer_accounts/lib/resolveTenantContext.ts` and
 * `directory/api/get/organizations/lookup.ts`):
 *
 * 1. Custom-domain host → `domainMappingService` (optional DI, owned by
 *    `customer_accounts`) yields tenant + organization. A caller-supplied shop
 *    identifier must agree with it.
 * 2. Signed-in customer session → the session's tenant + organization. A
 *    caller-supplied shop identifier must agree with it.
 * 3. Platform domain, anonymous → the caller names the SHOP (`orgSlug` or
 *    `organizationId`); the organization row is loaded server-side and the
 *    tenant is always derived from it. The caller can never choose a tenant.
 *
 * Inactive or deleted organizations never resolve. Returns a discriminated
 * result so routes can map failures to 400/404 without leaking which step
 * failed.
 */
export type StorefrontScopeResult =
  | { ok: true; scope: GiftCatalogScope; source: 'host' | 'customer' | 'shop' }
  | { ok: false; status: 400 | 404; reason: 'shop_required' | 'shop_not_found' | 'shop_mismatch' }

type DomainResolver = {
  resolveByHostname(hostname: string): Promise<{ tenantId: string; organizationId: string; status: string } | null>
}

type ShopIdentifier = { orgSlug?: string | null; organizationId?: string | null }

async function resolveFromHost(container: AppContainer, req: Request): Promise<GiftCatalogScope | null> {
  const host = req.headers.get('host')
  if (!host) return null
  try {
    const resolver = container.resolve('domainMappingService') as DomainResolver
    const mapping = await resolver.resolveByHostname(host)
    if (!mapping || mapping.status !== 'active') return null
    return { tenantId: mapping.tenantId, organizationId: mapping.organizationId }
  } catch {
    // customer_accounts absent or custom domains not configured: fall through.
    return null
  }
}

async function loadActiveOrganization(
  em: EntityManager,
  identifier: ShopIdentifier,
  tenantId?: string,
): Promise<{ id: string; tenantId: string; slug: string | null } | null> {
  const where: Record<string, unknown> = { deletedAt: null, isActive: true }
  if (identifier.organizationId) where.id = identifier.organizationId
  else if (identifier.orgSlug) where.slug = identifier.orgSlug
  else return null
  if (tenantId) where.tenant = tenantId
  // `slug` is unique per (tenant, slug), not globally: order deterministically so
  // an unscoped slug collision always resolves to the same organization.
  const organization = await em.findOne(Organization, where as FilterQuery<Organization>, {
    orderBy: { createdAt: 'ASC' },
  })
  if (!organization) return null
  const tenant = organization.tenant as unknown
  const resolvedTenantId =
    typeof tenant === 'string'
      ? tenant
      : tenant && typeof tenant === 'object' && 'id' in tenant
        ? String((tenant as { id: string }).id)
        : null
  if (!resolvedTenantId) return null
  return { id: String(organization.id), tenantId: resolvedTenantId, slug: organization.slug ?? null }
}

function identifierMatches(
  org: { id: string; slug: string | null },
  identifier: ShopIdentifier,
): boolean {
  if (identifier.organizationId && identifier.organizationId !== org.id) return false
  if (identifier.orgSlug && identifier.orgSlug !== org.slug) return false
  return true
}

function hasIdentifier(identifier: ShopIdentifier): boolean {
  return Boolean(identifier.organizationId || identifier.orgSlug)
}

export async function resolveStorefrontScope(
  req: Request,
  container: AppContainer,
  identifier: ShopIdentifier,
): Promise<StorefrontScopeResult> {
  const em = (container.resolve('em') as EntityManager).fork()

  const hostScope = await resolveFromHost(container, req)
  if (hostScope) {
    if (hasIdentifier(identifier)) {
      const org = await loadActiveOrganization(em, { organizationId: hostScope.organizationId }, hostScope.tenantId)
      if (!org || !identifierMatches(org, identifier)) return { ok: false, status: 404, reason: 'shop_mismatch' }
    }
    return { ok: true, scope: hostScope, source: 'host' }
  }

  const customer = await getCustomerAuthFromRequest(req).catch(() => null)
  if (customer?.tenantId && customer.orgId) {
    if (hasIdentifier(identifier)) {
      const org = await loadActiveOrganization(em, { organizationId: customer.orgId }, customer.tenantId)
      if (!org || !identifierMatches(org, identifier)) return { ok: false, status: 404, reason: 'shop_mismatch' }
    }
    return { ok: true, scope: { tenantId: customer.tenantId, organizationId: customer.orgId }, source: 'customer' }
  }

  if (!hasIdentifier(identifier)) return { ok: false, status: 400, reason: 'shop_required' }
  const org = await loadActiveOrganization(em, identifier)
  if (!org) return { ok: false, status: 404, reason: 'shop_not_found' }
  return { ok: true, scope: { tenantId: org.tenantId, organizationId: org.id }, source: 'shop' }
}
