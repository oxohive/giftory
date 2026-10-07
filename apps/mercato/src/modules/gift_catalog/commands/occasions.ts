import { z } from 'zod'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import {
  buildChanges,
  emitCrudSideEffects,
  emitCrudUndoSideEffects,
  requireId,
} from '@open-mercato/shared/lib/commands/helpers'
import type { CrudEmitContext, CrudEventsConfig, CrudIndexerConfig } from '@open-mercato/shared/lib/crud/types'
import { conflict, notFound } from '@open-mercato/shared/lib/crud/errors'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { GiftOccasion } from '../data/entities'
import { giftOccasionCreateSchema, giftOccasionUpdateSchema } from '../data/validators'
import {
  GIFT_OCCASION_CREATE_COMMAND,
  GIFT_OCCASION_DELETE_COMMAND,
  GIFT_OCCASION_ENTITY_ID,
  GIFT_OCCASION_RESOURCE_KIND,
  GIFT_OCCASION_UPDATE_COMMAND,
} from '../lib/constants'
import { resolveCommandScope, resolveUndoScope, toIso, type GiftCatalogScope } from './shared'


const systemScopeSchema = z.object({
  tenantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
})
const createCommandSchema = giftOccasionCreateSchema.merge(systemScopeSchema)
const updateCommandSchema = giftOccasionUpdateSchema.merge(systemScopeSchema)

export type SerializedGiftOccasion = {
  id: string
  tenantId: string
  organizationId: string
  code: string
  label: string
  description: string | null
  sortOrder: number
  isActive: boolean
  imageUrl: string | null
  updatedAt: string | null
}

export function serializeGiftOccasion(occasion: GiftOccasion): SerializedGiftOccasion {
  return {
    id: String(occasion.id),
    tenantId: String(occasion.tenantId),
    organizationId: String(occasion.organizationId),
    code: occasion.code,
    label: occasion.label,
    description: occasion.description ?? null,
    sortOrder: Number(occasion.sortOrder ?? 0),
    isActive: Boolean(occasion.isActive),
    imageUrl: occasion.imageUrl ?? null,
    updatedAt: toIso(occasion.updatedAt),
  }
}

export const giftOccasionCrudEvents: CrudEventsConfig<GiftOccasion> = {
  module: 'gift_catalog',
  entity: 'occasion',
  persistent: true,
  buildPayload: (ctx: CrudEmitContext<GiftOccasion>) => ({
    id: ctx.identifiers.id,
    tenantId: ctx.identifiers.tenantId,
    organizationId: ctx.identifiers.organizationId,
    code: ctx.entity?.code ?? null,
    ...(ctx.syncOrigin ? { syncOrigin: ctx.syncOrigin } : {}),
  }),
}

export const giftOccasionCrudIndexer: CrudIndexerConfig<GiftOccasion> = {
  entityType: GIFT_OCCASION_ENTITY_ID,
  buildUpsertPayload: (ctx: CrudEmitContext<GiftOccasion>) => ({
    entityType: GIFT_OCCASION_ENTITY_ID,
    recordId: ctx.identifiers.id,
    tenantId: ctx.identifiers.tenantId,
    organizationId: ctx.identifiers.organizationId,
  }),
  buildDeletePayload: (ctx: CrudEmitContext<GiftOccasion>) => ({
    entityType: GIFT_OCCASION_ENTITY_ID,
    recordId: ctx.identifiers.id,
    tenantId: ctx.identifiers.tenantId,
    organizationId: ctx.identifiers.organizationId,
  }),
}

function identifiersOf(occasion: { id: string }, scope: GiftCatalogScope) {
  return { id: String(occasion.id), tenantId: scope.tenantId, organizationId: scope.organizationId }
}

function applySnapshot(entity: GiftOccasion, snapshot: SerializedGiftOccasion): void {
  entity.code = snapshot.code
  entity.label = snapshot.label
  entity.description = snapshot.description
  entity.sortOrder = snapshot.sortOrder
  entity.isActive = snapshot.isActive
  entity.imageUrl = snapshot.imageUrl
}

async function findByCode(em: EntityManager, code: string, scope: GiftCatalogScope): Promise<GiftOccasion | null> {
  return em.findOne(GiftOccasion, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    code,
  } as FilterQuery<GiftOccasion>)
}

const CHANGE_KEYS = ['code', 'label', 'description', 'sortOrder', 'isActive', 'imageUrl']

const createGiftOccasionCommand: CommandHandler<Record<string, unknown>, GiftOccasion> = {
  id: GIFT_OCCASION_CREATE_COMMAND,
  isUndoable: true,
  async execute(rawInput, ctx) {
    const parsed = createCommandSchema.parse(rawInput)
    const scope = resolveCommandScope(ctx, parsed)
    const em = ctx.container.resolve<EntityManager>('em')
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const { translate } = await resolveTranslations()

    const existing = await findByCode(em, parsed.code, scope)
    if (existing && !existing.deletedAt) {
      throw conflict(translate('gift_catalog.errors.occasionCodeTaken', 'An occasion with this code already exists'))
    }
    const values = {
      code: parsed.code,
      label: parsed.label,
      description: parsed.description ?? null,
      sortOrder: parsed.sortOrder,
      isActive: parsed.isActive,
      imageUrl: parsed.imageUrl ?? null,
    }
    let occasion: GiftOccasion
    if (existing) {
      const revived = await de.updateOrmEntity({
        entity: GiftOccasion,
        where: { id: existing.id, tenantId: scope.tenantId, organizationId: scope.organizationId } as FilterQuery<GiftOccasion>,
        apply: (entity) => {
          Object.assign(entity, values)
          entity.deletedAt = null
        },
      })
      if (!revived) throw notFound(translate('gift_catalog.errors.occasionNotFound', 'Occasion not found'))
      occasion = revived
    } else {
      occasion = await de.createOrmEntity({
        entity: GiftOccasion,
        data: { tenantId: scope.tenantId, organizationId: scope.organizationId, ...values },
      })
    }
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: occasion,
      identifiers: identifiersOf(occasion, scope),
      syncOrigin: ctx.syncOrigin,
      events: giftOccasionCrudEvents,
      indexer: giftOccasionCrudIndexer,
    })
    return occasion
  },
  captureAfter: (_input, result) => serializeGiftOccasion(result),
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('gift_catalog.audit.occasions.create', 'Create gift occasion'),
      resourceKind: GIFT_OCCASION_RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: String(result.tenantId),
      organizationId: String(result.organizationId),
      snapshotAfter: serializeGiftOccasion(result),
    }
  },
  async undo({ logEntry, ctx }) {
    const after = logEntry.snapshotAfter as SerializedGiftOccasion | undefined
    if (!after?.id) throw new Error('[internal] Missing gift occasion snapshot for undo')
    const scope = resolveUndoScope(ctx, after)
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const removed = await de.deleteOrmEntity({
      entity: GiftOccasion,
      where: { id: after.id, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null } as FilterQuery<GiftOccasion>,
      soft: true,
      softDeleteField: 'deletedAt',
    })
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'deleted',
      entity: removed,
      identifiers: { id: after.id, tenantId: scope.tenantId, organizationId: scope.organizationId },
      syncOrigin: ctx.syncOrigin,
      events: giftOccasionCrudEvents,
      indexer: giftOccasionCrudIndexer,
    })
  },
}

const updateGiftOccasionCommand: CommandHandler<Record<string, unknown>, GiftOccasion> = {
  id: GIFT_OCCASION_UPDATE_COMMAND,
  isUndoable: true,
  async prepare(rawInput, ctx) {
    const parsed = updateCommandSchema.parse(rawInput)
    const scope = resolveCommandScope(ctx, parsed)
    const em = ctx.container.resolve<EntityManager>('em')
    const { translate } = await resolveTranslations()
    const existing = await em.findOne(GiftOccasion, {
      id: parsed.id,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      deletedAt: null,
    } as FilterQuery<GiftOccasion>)
    if (!existing) throw notFound(translate('gift_catalog.errors.occasionNotFound', 'Occasion not found'))
    enforceCommandOptimisticLock({
      resourceKind: GIFT_OCCASION_RESOURCE_KIND,
      resourceId: parsed.id,
      current: existing.updatedAt,
      request: ctx.request ?? null,
    })
    if (parsed.code && parsed.code !== existing.code) {
      const clash = await findByCode(em, parsed.code, scope)
      if (clash && clash.id !== existing.id) {
        throw conflict(translate('gift_catalog.errors.occasionCodeTaken', 'An occasion with this code already exists'))
      }
    }
    return { before: serializeGiftOccasion(existing) }
  },
  async execute(rawInput, ctx) {
    const parsed = updateCommandSchema.parse(rawInput)
    const scope = resolveCommandScope(ctx, parsed)
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const { translate } = await resolveTranslations()
    const updated = await de.updateOrmEntity({
      entity: GiftOccasion,
      where: { id: parsed.id, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null } as FilterQuery<GiftOccasion>,
      apply: (entity) => {
        if (parsed.code !== undefined) entity.code = parsed.code
        if (parsed.label !== undefined) entity.label = parsed.label
        if (parsed.description !== undefined) entity.description = parsed.description
        if (parsed.sortOrder !== undefined) entity.sortOrder = parsed.sortOrder
        if (parsed.isActive !== undefined) entity.isActive = parsed.isActive
        if (parsed.imageUrl !== undefined) entity.imageUrl = parsed.imageUrl
        entity.updatedAt = new Date()
      },
    })
    if (!updated) throw notFound(translate('gift_catalog.errors.occasionNotFound', 'Occasion not found'))
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: updated,
      identifiers: identifiersOf(updated, scope),
      syncOrigin: ctx.syncOrigin,
      events: giftOccasionCrudEvents,
      indexer: giftOccasionCrudIndexer,
    })
    return updated
  },
  captureAfter: (_input, result) => serializeGiftOccasion(result),
  buildLog: async ({ result, snapshots }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as SerializedGiftOccasion | undefined
    const after = serializeGiftOccasion(result)
    return {
      actionLabel: translate('gift_catalog.audit.occasions.update', 'Update gift occasion'),
      resourceKind: GIFT_OCCASION_RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: after.tenantId,
      organizationId: after.organizationId,
      changes: buildChanges(
        (before ?? null) as Record<string, unknown> | null,
        after as unknown as Record<string, unknown>,
        CHANGE_KEYS,
      ),
      snapshotBefore: before ?? null,
      snapshotAfter: after,
    }
  },
  async undo({ logEntry, ctx }) {
    const before = logEntry.snapshotBefore as SerializedGiftOccasion | undefined
    if (!before?.id) throw new Error('[internal] Missing gift occasion snapshot for undo')
    const scope = resolveUndoScope(ctx, before)
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const restored = await de.updateOrmEntity({
      entity: GiftOccasion,
      where: { id: before.id, tenantId: scope.tenantId, organizationId: scope.organizationId } as FilterQuery<GiftOccasion>,
      apply: (entity) => {
        applySnapshot(entity, before)
        entity.updatedAt = new Date()
      },
    })
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: restored,
      identifiers: { id: before.id, tenantId: scope.tenantId, organizationId: scope.organizationId },
      syncOrigin: ctx.syncOrigin,
      events: giftOccasionCrudEvents,
      indexer: giftOccasionCrudIndexer,
    })
  },
}

type DeleteInput = { body?: Record<string, unknown>; query?: Record<string, unknown> } & Record<string, unknown>

function systemScopeFromDeleteInput(input: DeleteInput) {
  const body = input.body && typeof input.body === 'object' ? input.body : {}
  return { tenantId: input.tenantId ?? body.tenantId, organizationId: input.organizationId ?? body.organizationId }
}

const deleteGiftOccasionCommand: CommandHandler<DeleteInput, GiftOccasion> = {
  id: GIFT_OCCASION_DELETE_COMMAND,
  isUndoable: true,
  async prepare(input, ctx) {
    const id = requireId(input, 'Occasion id required')
    const scope = resolveCommandScope(ctx, systemScopeFromDeleteInput(input))
    const em = ctx.container.resolve<EntityManager>('em')
    const existing = await em.findOne(GiftOccasion, {
      id,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      deletedAt: null,
    } as FilterQuery<GiftOccasion>)
    if (!existing) return {}
    enforceCommandOptimisticLock({
      resourceKind: GIFT_OCCASION_RESOURCE_KIND,
      resourceId: id,
      current: existing.updatedAt,
      request: ctx.request ?? null,
    })
    return { before: serializeGiftOccasion(existing) }
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Occasion id required')
    const scope = resolveCommandScope(ctx, systemScopeFromDeleteInput(input))
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const { translate } = await resolveTranslations()
    const removed = await de.deleteOrmEntity({
      entity: GiftOccasion,
      where: { id, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null } as FilterQuery<GiftOccasion>,
      soft: true,
      softDeleteField: 'deletedAt',
    })
    if (!removed) throw notFound(translate('gift_catalog.errors.occasionNotFound', 'Occasion not found'))
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'deleted',
      entity: removed,
      identifiers: identifiersOf(removed, scope),
      syncOrigin: ctx.syncOrigin,
      events: giftOccasionCrudEvents,
      indexer: giftOccasionCrudIndexer,
    })
    return removed
  },
  buildLog: async ({ snapshots, input }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as SerializedGiftOccasion | undefined
    return {
      actionLabel: translate('gift_catalog.audit.occasions.delete', 'Delete gift occasion'),
      resourceKind: GIFT_OCCASION_RESOURCE_KIND,
      resourceId: requireId(input, 'Occasion id required'),
      tenantId: before?.tenantId ?? null,
      organizationId: before?.organizationId ?? null,
      snapshotBefore: before ?? null,
    }
  },
  async undo({ logEntry, ctx }) {
    const before = logEntry.snapshotBefore as SerializedGiftOccasion | undefined
    if (!before?.id) throw new Error('[internal] Missing gift occasion snapshot for undo')
    const scope = resolveUndoScope(ctx, before)
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const restored = await de.updateOrmEntity({
      entity: GiftOccasion,
      where: { id: before.id, tenantId: scope.tenantId, organizationId: scope.organizationId } as FilterQuery<GiftOccasion>,
      apply: (entity) => {
        applySnapshot(entity, before)
        entity.deletedAt = null
        entity.updatedAt = new Date()
      },
    })
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'created',
      entity: restored,
      identifiers: { id: before.id, tenantId: scope.tenantId, organizationId: scope.organizationId },
      syncOrigin: ctx.syncOrigin,
      events: giftOccasionCrudEvents,
      indexer: giftOccasionCrudIndexer,
    })
  },
}

registerCommand(createGiftOccasionCommand)
registerCommand(updateGiftOccasionCommand)
registerCommand(deleteGiftOccasionCommand)
