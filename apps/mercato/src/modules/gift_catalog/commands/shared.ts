import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { badRequest } from '@open-mercato/shared/lib/crud/errors'

export type GiftCatalogScope = { tenantId: string; organizationId: string }

/**
 * Internal-only scope carried on command input by trusted server-side callers
 * (CLI seeding, tenant setup). It is honored ONLY when the runtime context is a
 * `systemActor`; HTTP routes never set that flag and their Zod schemas strip any
 * payload `tenantId`/`organizationId`, so a request cannot choose its scope.
 */
export type SystemScopeInput = {
  tenantId?: unknown
  organizationId?: unknown
}

function readUuid(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Derive the trusted tenant/organization scope for a gift_catalog command and
 * fail closed when either is missing.
 */
export function resolveCommandScope(ctx: CommandRuntimeContext, input?: SystemScopeInput | null): GiftCatalogScope {
  const systemTenantId = ctx.systemActor === true ? readUuid(input?.tenantId) : null
  const systemOrganizationId = ctx.systemActor === true ? readUuid(input?.organizationId) : null

  const tenantId = ctx.auth?.tenantId ?? systemTenantId ?? null
  if (!tenantId) throw badRequest('[internal] gift_catalog command requires a tenant scope')

  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId ?? systemOrganizationId ?? null
  if (!organizationId) throw badRequest('[internal] gift_catalog command requires an organization scope')

  ensureTenantScope(ctx, tenantId)
  ensureOrganizationScope(ctx, organizationId)
  return { tenantId, organizationId }
}

/**
 * Undo must act in the scope the original command ran in, and never cross into
 * another tenant or an organization the caller cannot access.
 */
export function resolveUndoScope(
  ctx: CommandRuntimeContext,
  snapshot: { tenantId: string; organizationId: string },
): GiftCatalogScope {
  ensureTenantScope(ctx, snapshot.tenantId)
  ensureOrganizationScope(ctx, snapshot.organizationId)
  return { tenantId: snapshot.tenantId, organizationId: snapshot.organizationId }
}

export function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
