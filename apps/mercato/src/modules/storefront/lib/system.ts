import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { Dictionary, DictionaryEntry } from '@open-mercato/core/modules/dictionaries/data/entities'
import type { StorefrontScope } from './scope'

/**
 * Command context for storefront-initiated writes. Shoppers are not staff
 * users, so commands run as a scoped system actor pinned to the shop resolved
 * server-side (the same pattern `checkout` uses for public pay-link submits):
 * `ensureOrganizationScope` accepts exactly this organization and nothing else.
 */
export function systemCommandContext(container: AppContainer, scope: StorefrontScope, request?: Request): CommandRuntimeContext {
  return {
    container,
    auth: null,
    organizationScope: null,
    selectedOrganizationId: scope.organizationId,
    organizationIds: [scope.organizationId],
    systemActor: true,
    ...(request ? { request } : {}),
  }
}

export async function executeCommand<TInput, TResult>(
  container: AppContainer,
  commandId: string,
  input: TInput,
  ctx: CommandRuntimeContext,
): Promise<TResult> {
  const commandBus = container.resolve('commandBus') as CommandBus
  const { result } = await commandBus.execute<TInput, TResult>(commandId, { input, ctx })
  return result
}

/**
 * Read-only lookup of a sales dictionary entry id by value (e.g. the
 * `captured` payment status). Entries are seeded by the sales module; a
 * missing entry returns null and callers skip the status update.
 */
export async function findSalesDictionaryEntryId(
  em: EntityManager,
  scope: StorefrontScope,
  dictionaryKey: string,
  value: string,
): Promise<string | null> {
  const dictionary = await em.findOne(Dictionary, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    key: dictionaryKey,
    deletedAt: null,
  } as FilterQuery<Dictionary>)
  if (!dictionary) return null
  const entry = await em.findOne(DictionaryEntry, {
    dictionary: dictionary.id,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    normalizedValue: value.trim().toLowerCase(),
  } as FilterQuery<DictionaryEntry>)
  return entry ? String(entry.id) : null
}
