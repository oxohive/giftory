import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { badRequest } from '@open-mercato/shared/lib/crud/errors'
import type { DealerLedgerEntry } from '../data/entities'

export type PayoutsScope = { tenantId: string; organizationId: string }

export function resolveCommandScope(
  ctx: CommandRuntimeContext,
  input?: { tenantId?: unknown; organizationId?: unknown } | null,
): PayoutsScope {
  const systemTenantId = ctx.systemActor === true && typeof input?.tenantId === 'string' ? input.tenantId : null
  const systemOrganizationId =
    ctx.systemActor === true && typeof input?.organizationId === 'string' ? input.organizationId : null

  const tenantId = ctx.auth?.tenantId ?? systemTenantId ?? null
  if (!tenantId) throw badRequest('[internal] payouts command requires a tenant scope')

  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId ?? systemOrganizationId ?? null
  if (!organizationId) throw badRequest('[internal] payouts command requires an organization scope')

  ensureTenantScope(ctx, tenantId)
  return { tenantId, organizationId }
}

export type SerializedLedgerEntry = {
  id: string
  dealerProfileId: string
  tenantId: string
  entryType: string
  amount: number
  currencyCode: string
  direction: string
  referenceType: string
  referenceId: string
  note: string | null
  createdBy: string
  createdAt: string
}

export function serializeLedgerEntry(e: DealerLedgerEntry): SerializedLedgerEntry {
  return {
    id: String(e.id),
    dealerProfileId: String(e.dealerProfileId),
    tenantId: String(e.tenantId),
    entryType: e.entryType,
    amount: parseInt(String(e.amount), 10),
    currencyCode: e.currencyCode,
    direction: e.direction,
    referenceType: e.referenceType,
    referenceId: String(e.referenceId),
    note: e.note ?? null,
    createdBy: String(e.createdBy),
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
  }
}
