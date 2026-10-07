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
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CatalogProduct } from '@open-mercato/core/modules/catalog/data/entities'
import { GiftProductProfile } from '../data/entities'
import {
  giftProductProfileCreateSchema,
  giftProductProfileUpdateSchema,
} from '../data/validators'
import {
  GIFT_PRODUCT_PROFILE_ENTITY_ID,
  GIFT_PRODUCT_PROFILE_RESOURCE_KIND,
  GIFT_PROFILE_CREATE_COMMAND,
  GIFT_PROFILE_DELETE_COMMAND,
  GIFT_PROFILE_UPDATE_COMMAND,
  type GiftFulfillmentMode,
} from '../lib/constants'
import { resolveCommandScope, resolveUndoScope, toIso, type GiftCatalogScope } from './shared'


/** Command-level schema: the route schema plus system-only scope (see `resolveCommandScope`). */
const systemScopeSchema = z.object({
  tenantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
})
const createCommandSchema = giftProductProfileCreateSchema.merge(systemScopeSchema)
const updateCommandSchema = giftProductProfileUpdateSchema.merge(systemScopeSchema)

export type SerializedGiftProductProfile = {
  id: string
  tenantId: string
  organizationId: string
  productId: string
  occasions: string[]
  recipientTypes: string[]
  isCustomizable: boolean
  proofRequired: boolean
  giftWrapAvailable: boolean
  giftMessageMaxLength: number
  productionLeadTimeDays: number | null
  personalizationNotes: string | null
  fulfillmentMode: GiftFulfillmentMode
  updatedAt: string | null
}

export function serializeGiftProductProfile(profile: GiftProductProfile): SerializedGiftProductProfile {
  return {
    id: String(profile.id),
    tenantId: String(profile.tenantId),
    organizationId: String(profile.organizationId),
    productId: String(profile.productId),
    occasions: Array.isArray(profile.occasions) ? [...profile.occasions] : [],
    recipientTypes: Array.isArray(profile.recipientTypes) ? [...profile.recipientTypes] : [],
    isCustomizable: Boolean(profile.isCustomizable),
    proofRequired: Boolean(profile.proofRequired),
    giftWrapAvailable: Boolean(profile.giftWrapAvailable),
    giftMessageMaxLength: Number(profile.giftMessageMaxLength ?? 0),
    productionLeadTimeDays: profile.productionLeadTimeDays ?? null,
    personalizationNotes: profile.personalizationNotes ?? null,
    fulfillmentMode: profile.fulfillmentMode,
    updatedAt: toIso(profile.updatedAt),
  }
}

export const giftProfileCrudEvents: CrudEventsConfig<GiftProductProfile> = {
  module: 'gift_catalog',
  entity: 'profile',
  persistent: true,
  buildPayload: (ctx: CrudEmitContext<GiftProductProfile>) => ({
    id: ctx.identifiers.id,
    tenantId: ctx.identifiers.tenantId,
    organizationId: ctx.identifiers.organizationId,
    productId: ctx.entity?.productId ?? null,
    ...(ctx.syncOrigin ? { syncOrigin: ctx.syncOrigin } : {}),
  }),
}

export const giftProfileCrudIndexer: CrudIndexerConfig<GiftProductProfile> = {
  entityType: GIFT_PRODUCT_PROFILE_ENTITY_ID,
  buildUpsertPayload: (ctx: CrudEmitContext<GiftProductProfile>) => ({
    entityType: GIFT_PRODUCT_PROFILE_ENTITY_ID,
    recordId: ctx.identifiers.id,
    tenantId: ctx.identifiers.tenantId,
    organizationId: ctx.identifiers.organizationId,
  }),
  buildDeletePayload: (ctx: CrudEmitContext<GiftProductProfile>) => ({
    entityType: GIFT_PRODUCT_PROFILE_ENTITY_ID,
    recordId: ctx.identifiers.id,
    tenantId: ctx.identifiers.tenantId,
    organizationId: ctx.identifiers.organizationId,
  }),
}

function identifiersOf(profile: { id: string }, scope: GiftCatalogScope) {
  return { id: String(profile.id), tenantId: scope.tenantId, organizationId: scope.organizationId }
}

async function assertCatalogProductInScope(em: EntityManager, productId: string, scope: GiftCatalogScope): Promise<void> {
  const { translate } = await resolveTranslations()
  const product = await findOneWithDecryption(
    em,
    CatalogProduct,
    {
      id: productId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      deletedAt: null,
    } as FilterQuery<CatalogProduct>,
    undefined,
    scope,
  )
  if (!product) throw notFound(translate('gift_catalog.errors.productNotFound', 'Catalog product not found'))
}

async function loadLiveProfile(em: EntityManager, id: string, scope: GiftCatalogScope): Promise<GiftProductProfile | null> {
  return em.findOne(GiftProductProfile, {
    id,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    deletedAt: null,
  } as FilterQuery<GiftProductProfile>)
}

function applySnapshot(entity: GiftProductProfile, snapshot: SerializedGiftProductProfile): void {
  entity.productId = snapshot.productId
  entity.occasions = [...snapshot.occasions]
  entity.recipientTypes = [...snapshot.recipientTypes]
  entity.isCustomizable = snapshot.isCustomizable
  entity.proofRequired = snapshot.proofRequired
  entity.giftWrapAvailable = snapshot.giftWrapAvailable
  entity.giftMessageMaxLength = snapshot.giftMessageMaxLength
  entity.productionLeadTimeDays = snapshot.productionLeadTimeDays
  entity.personalizationNotes = snapshot.personalizationNotes
  entity.fulfillmentMode = snapshot.fulfillmentMode
}

const CHANGE_KEYS = [
  'occasions',
  'recipientTypes',
  'isCustomizable',
  'proofRequired',
  'giftWrapAvailable',
  'giftMessageMaxLength',
  'productionLeadTimeDays',
  'personalizationNotes',
  'fulfillmentMode',
]

const createGiftProfileCommand: CommandHandler<Record<string, unknown>, GiftProductProfile> = {
  id: GIFT_PROFILE_CREATE_COMMAND,
  isUndoable: true,
  async execute(rawInput, ctx) {
    const parsed = createCommandSchema.parse(rawInput)
    const scope = resolveCommandScope(ctx, parsed)
    const em = ctx.container.resolve<EntityManager>('em')
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const { translate } = await resolveTranslations()

    await assertCatalogProductInScope(em, parsed.productId, scope)

    // The unique constraint spans soft-deleted rows, so a previously deleted
    // profile for this product is revived rather than duplicated. A live one is
    // a conflict: callers must update it instead.
    const existing = await em.findOne(GiftProductProfile, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      productId: parsed.productId,
    } as FilterQuery<GiftProductProfile>)
    if (existing && !existing.deletedAt) {
      throw conflict(translate('gift_catalog.errors.profileExists', 'This product already has a gift profile'))
    }

    const values = {
      occasions: parsed.occasions,
      recipientTypes: parsed.recipientTypes,
      isCustomizable: parsed.isCustomizable,
      proofRequired: parsed.proofRequired,
      giftWrapAvailable: parsed.giftWrapAvailable,
      giftMessageMaxLength: parsed.giftMessageMaxLength,
      productionLeadTimeDays: parsed.productionLeadTimeDays ?? null,
      personalizationNotes: parsed.personalizationNotes ?? null,
      fulfillmentMode: parsed.fulfillmentMode,
    }

    let profile: GiftProductProfile
    if (existing) {
      const revived = await de.updateOrmEntity({
        entity: GiftProductProfile,
        where: { id: existing.id, tenantId: scope.tenantId, organizationId: scope.organizationId } as FilterQuery<GiftProductProfile>,
        apply: (entity) => {
          Object.assign(entity, values)
          entity.deletedAt = null
        },
      })
      if (!revived) throw notFound(translate('gift_catalog.errors.profileNotFound', 'Gift profile not found'))
      profile = revived
    } else {
      profile = await de.createOrmEntity({
        entity: GiftProductProfile,
        data: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          productId: parsed.productId,
          ...values,
        },
      })
    }

    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: profile,
      identifiers: identifiersOf(profile, scope),
      syncOrigin: ctx.syncOrigin,
      events: giftProfileCrudEvents,
      indexer: giftProfileCrudIndexer,
    })
    return profile
  },
  captureAfter: (_input, result) => serializeGiftProductProfile(result),
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('gift_catalog.audit.profiles.create', 'Create gift profile'),
      resourceKind: GIFT_PRODUCT_PROFILE_RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: String(result.tenantId),
      organizationId: String(result.organizationId),
      snapshotAfter: serializeGiftProductProfile(result),
    }
  },
  async undo({ logEntry, ctx }) {
    const after = logEntry.snapshotAfter as SerializedGiftProductProfile | undefined
    if (!after?.id) throw new Error('[internal] Missing gift profile snapshot for undo')
    const scope = resolveUndoScope(ctx, after)
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const removed = await de.deleteOrmEntity({
      entity: GiftProductProfile,
      where: { id: after.id, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null } as FilterQuery<GiftProductProfile>,
      soft: true,
      softDeleteField: 'deletedAt',
    })
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'deleted',
      entity: removed,
      identifiers: { id: after.id, tenantId: scope.tenantId, organizationId: scope.organizationId },
      syncOrigin: ctx.syncOrigin,
      events: giftProfileCrudEvents,
      indexer: giftProfileCrudIndexer,
    })
  },
}

const updateGiftProfileCommand: CommandHandler<Record<string, unknown>, GiftProductProfile> = {
  id: GIFT_PROFILE_UPDATE_COMMAND,
  isUndoable: true,
  async prepare(rawInput, ctx) {
    const parsed = updateCommandSchema.parse(rawInput)
    const scope = resolveCommandScope(ctx, parsed)
    const em = ctx.container.resolve<EntityManager>('em')
    const { translate } = await resolveTranslations()
    const existing = await loadLiveProfile(em, parsed.id, scope)
    if (!existing) throw notFound(translate('gift_catalog.errors.profileNotFound', 'Gift profile not found'))
    // `prepare` always runs before `execute`, so a stale version aborts the
    // write instead of racing it. No-op when the client sent no version.
    enforceCommandOptimisticLock({
      resourceKind: GIFT_PRODUCT_PROFILE_RESOURCE_KIND,
      resourceId: parsed.id,
      current: existing.updatedAt,
      request: ctx.request ?? null,
    })
    return { before: serializeGiftProductProfile(existing) }
  },
  async execute(rawInput, ctx) {
    const parsed = updateCommandSchema.parse(rawInput)
    const scope = resolveCommandScope(ctx, parsed)
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const { translate } = await resolveTranslations()
    const updated = await de.updateOrmEntity({
      entity: GiftProductProfile,
      where: { id: parsed.id, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null } as FilterQuery<GiftProductProfile>,
      apply: (entity) => {
        if (parsed.occasions !== undefined) entity.occasions = parsed.occasions
        if (parsed.recipientTypes !== undefined) entity.recipientTypes = parsed.recipientTypes
        if (parsed.isCustomizable !== undefined) entity.isCustomizable = parsed.isCustomizable
        if (parsed.proofRequired !== undefined) entity.proofRequired = parsed.proofRequired
        if (parsed.giftWrapAvailable !== undefined) entity.giftWrapAvailable = parsed.giftWrapAvailable
        if (parsed.giftMessageMaxLength !== undefined) entity.giftMessageMaxLength = parsed.giftMessageMaxLength
        if (parsed.productionLeadTimeDays !== undefined) entity.productionLeadTimeDays = parsed.productionLeadTimeDays
        if (parsed.personalizationNotes !== undefined) entity.personalizationNotes = parsed.personalizationNotes
        if (parsed.fulfillmentMode !== undefined) entity.fulfillmentMode = parsed.fulfillmentMode
        entity.updatedAt = new Date()
      },
    })
    if (!updated) throw notFound(translate('gift_catalog.errors.profileNotFound', 'Gift profile not found'))
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: updated,
      identifiers: identifiersOf(updated, scope),
      syncOrigin: ctx.syncOrigin,
      events: giftProfileCrudEvents,
      indexer: giftProfileCrudIndexer,
    })
    return updated
  },
  captureAfter: (_input, result) => serializeGiftProductProfile(result),
  buildLog: async ({ result, snapshots }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as SerializedGiftProductProfile | undefined
    const after = serializeGiftProductProfile(result)
    return {
      actionLabel: translate('gift_catalog.audit.profiles.update', 'Update gift profile'),
      resourceKind: GIFT_PRODUCT_PROFILE_RESOURCE_KIND,
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
    const before = logEntry.snapshotBefore as SerializedGiftProductProfile | undefined
    if (!before?.id) throw new Error('[internal] Missing gift profile snapshot for undo')
    const scope = resolveUndoScope(ctx, before)
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const restored = await de.updateOrmEntity({
      entity: GiftProductProfile,
      where: { id: before.id, tenantId: scope.tenantId, organizationId: scope.organizationId } as FilterQuery<GiftProductProfile>,
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
      events: giftProfileCrudEvents,
      indexer: giftProfileCrudIndexer,
    })
  },
}

type DeleteInput = { body?: Record<string, unknown>; query?: Record<string, unknown> } & Record<string, unknown>

function systemScopeFromDeleteInput(input: DeleteInput) {
  const body = input.body && typeof input.body === 'object' ? input.body : {}
  return { tenantId: input.tenantId ?? body.tenantId, organizationId: input.organizationId ?? body.organizationId }
}

const deleteGiftProfileCommand: CommandHandler<DeleteInput, GiftProductProfile> = {
  id: GIFT_PROFILE_DELETE_COMMAND,
  isUndoable: true,
  async prepare(input, ctx) {
    const id = requireId(input, 'Gift profile id required')
    const scope = resolveCommandScope(ctx, systemScopeFromDeleteInput(input))
    const em = ctx.container.resolve<EntityManager>('em')
    const existing = await loadLiveProfile(em, id, scope)
    if (!existing) return {}
    enforceCommandOptimisticLock({
      resourceKind: GIFT_PRODUCT_PROFILE_RESOURCE_KIND,
      resourceId: id,
      current: existing.updatedAt,
      request: ctx.request ?? null,
    })
    return { before: serializeGiftProductProfile(existing) }
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Gift profile id required')
    const scope = resolveCommandScope(ctx, systemScopeFromDeleteInput(input))
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const { translate } = await resolveTranslations()
    const removed = await de.deleteOrmEntity({
      entity: GiftProductProfile,
      where: { id, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null } as FilterQuery<GiftProductProfile>,
      soft: true,
      softDeleteField: 'deletedAt',
    })
    if (!removed) throw notFound(translate('gift_catalog.errors.profileNotFound', 'Gift profile not found'))
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'deleted',
      entity: removed,
      identifiers: identifiersOf(removed, scope),
      syncOrigin: ctx.syncOrigin,
      events: giftProfileCrudEvents,
      indexer: giftProfileCrudIndexer,
    })
    return removed
  },
  buildLog: async ({ snapshots, input }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as SerializedGiftProductProfile | undefined
    return {
      actionLabel: translate('gift_catalog.audit.profiles.delete', 'Delete gift profile'),
      resourceKind: GIFT_PRODUCT_PROFILE_RESOURCE_KIND,
      resourceId: requireId(input, 'Gift profile id required'),
      tenantId: before?.tenantId ?? null,
      organizationId: before?.organizationId ?? null,
      snapshotBefore: before ?? null,
    }
  },
  async undo({ logEntry, ctx }) {
    const before = logEntry.snapshotBefore as SerializedGiftProductProfile | undefined
    if (!before?.id) throw new Error('[internal] Missing gift profile snapshot for undo')
    const scope = resolveUndoScope(ctx, before)
    const de = ctx.container.resolve<DataEngine>('dataEngine')
    const restored = await de.updateOrmEntity({
      entity: GiftProductProfile,
      where: { id: before.id, tenantId: scope.tenantId, organizationId: scope.organizationId } as FilterQuery<GiftProductProfile>,
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
      events: giftProfileCrudEvents,
      indexer: giftProfileCrudIndexer,
    })
  },
}

registerCommand(createGiftProfileCommand)
registerCommand(updateGiftProfileCommand)
registerCommand(deleteGiftProfileCommand)

