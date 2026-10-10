import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { badRequest } from '@open-mercato/shared/lib/crud/errors'

export type DealerOnboardingScope = { tenantId: string; organizationId: string }

export type SystemScopeInput = {
  tenantId?: unknown
  organizationId?: unknown
}

function readUuid(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Derive the trusted tenant/organization scope for a dealer_onboarding command.
 * HTTP routes never set systemActor so payload scope is ignored for them.
 */
export function resolveCommandScope(ctx: CommandRuntimeContext, input?: SystemScopeInput | null): DealerOnboardingScope {
  const systemTenantId = ctx.systemActor === true ? readUuid(input?.tenantId) : null
  const systemOrganizationId = ctx.systemActor === true ? readUuid(input?.organizationId) : null

  const tenantId = ctx.auth?.tenantId ?? systemTenantId ?? null
  if (!tenantId) throw badRequest('[internal] dealer_onboarding command requires a tenant scope')

  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId ?? systemOrganizationId ?? null
  if (!organizationId) throw badRequest('[internal] dealer_onboarding command requires an organization scope')

  ensureTenantScope(ctx, tenantId)
  ensureOrganizationScope(ctx, organizationId)
  return { tenantId, organizationId }
}

/** Build a system-actor CommandRuntimeContext for setup and registration callbacks. */
export function systemActorContext(
  container: import('awilix').AwilixContainer,
  tenantId: string,
  organizationId: string,
): CommandRuntimeContext {
  return {
    container,
    auth: { tenantId, isSuperAdmin: false, orgId: organizationId, sub: 'system' } as CommandRuntimeContext['auth'],
    organizationScope: null,
    selectedOrganizationId: organizationId,
    organizationIds: [organizationId],
    systemActor: true,
  }
}
