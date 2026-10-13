import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { badRequest } from '@open-mercato/shared/lib/crud/errors'

export type DealerOrdersScope = { tenantId: string; organizationId: string }

export type SystemScopeInput = {
  tenantId?: unknown
  organizationId?: unknown
}

function readUuid(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function resolveCommandScope(ctx: CommandRuntimeContext, input?: SystemScopeInput | null): DealerOrdersScope {
  const systemTenantId = ctx.systemActor === true ? readUuid(input?.tenantId) : null
  const systemOrganizationId = ctx.systemActor === true ? readUuid(input?.organizationId) : null

  const tenantId = ctx.auth?.tenantId ?? systemTenantId ?? null
  if (!tenantId) throw badRequest('[internal] dealer_orders command requires a tenant scope')

  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId ?? systemOrganizationId ?? null
  if (!organizationId) throw badRequest('[internal] dealer_orders command requires an organization scope')

  ensureTenantScope(ctx, tenantId)
  ensureOrganizationScope(ctx, organizationId)
  return { tenantId, organizationId }
}

export function resolveUndoScope(
  ctx: CommandRuntimeContext,
  snapshot: { tenantId: string; organizationId: string },
): DealerOrdersScope {
  ensureTenantScope(ctx, snapshot.tenantId)
  ensureOrganizationScope(ctx, snapshot.organizationId)
  return { tenantId: snapshot.tenantId, organizationId: snapshot.organizationId }
}

export function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
