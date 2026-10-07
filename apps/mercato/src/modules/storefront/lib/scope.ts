import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import {
  getCustomerAuthFromRequest,
  type CustomerAuthContext,
} from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { resolveStorefrontScope } from '../../gift_catalog/lib/storefrontScope'
import { shopIdentifierSchema, type ShopIdentifier } from '../data/validators'

export type StorefrontScope = { tenantId: string; organizationId: string }

export type ShopperContext = {
  scope: StorefrontScope
  /** Signed-in customer of THIS shop, or null (guest / session of another shop). */
  customer: CustomerAuthContext | null
  source: 'host' | 'customer' | 'shop'
}

export type ShopperResolution =
  | { ok: true; shopper: ShopperContext }
  | { ok: false; status: 400 | 404; code: 'shop_required' | 'shop_not_found' }

/**
 * Shop identifier from the query string only. Bodies never carry scope; the
 * storefront BFF proxy injects `organizationId` server-side.
 */
export function readShopIdentifier(url: URL): ShopIdentifier {
  const parsed = shopIdentifierSchema.safeParse({
    orgSlug: url.searchParams.get('orgSlug') ?? undefined,
    organizationId: url.searchParams.get('organizationId') ?? undefined,
  })
  // A malformed identifier must not silently fall back to "no identifier".
  if (!parsed.success) return { orgSlug: '\u0000invalid' }
  return parsed.data
}

/**
 * Resolve the trusted shop scope exactly like the gift_catalog storefront
 * routes (custom-domain host → customer session → shop identifier, tenant
 * always derived server-side), then attach the customer session only when it
 * belongs to that same shop. Fails closed.
 */
export async function resolveShopper(req: Request, container: AppContainer): Promise<ShopperResolution> {
  const identifier = readShopIdentifier(new URL(req.url))
  const resolved = await resolveStorefrontScope(req, container, identifier)
  if (!resolved.ok) {
    return {
      ok: false,
      status: resolved.status,
      code: resolved.reason === 'shop_required' ? 'shop_required' : 'shop_not_found',
    }
  }
  const scope = { tenantId: resolved.scope.tenantId, organizationId: resolved.scope.organizationId }
  const session = await getCustomerAuthFromRequest(req).catch(() => null)
  const customer = session && session.tenantId === scope.tenantId && session.orgId === scope.organizationId ? session : null
  return { ok: true, shopper: { scope, customer, source: resolved.source } }
}
