import { z } from 'zod'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { ensureOrganizationScope, ensureTenantScope } from '@open-mercato/shared/lib/commands/scope'
import { badRequest, notFound } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { StorefrontAddress } from '../data/entities'
import { serializeAddress, type SerializedAddress } from '../lib/addresses'
import { addressCreateSchema, addressUpdateSchema } from '../data/validators'
import {
  STOREFRONT_ADDRESS_CREATE_COMMAND,
  STOREFRONT_ADDRESS_DELETE_COMMAND,
  STOREFRONT_ADDRESS_UPDATE_COMMAND,
} from '../lib/constants'

/**
 * Address book commands. The owner (tenant, organization, customer user) is
 * carried on the input by the storefront routes, which take it from the
 * verified customer session — never from the request body (the body schemas
 * have no such fields). It is honored only for a `systemActor` context pinned
 * to that organization.
 */
const MAX_ADDRESSES = 50

const ownerSchema = z.object({
  tenantId: z.string().uuid(),
  organizationId: z.string().uuid(),
  customerUserId: z.string().uuid(),
})
type Owner = z.infer<typeof ownerSchema>

const createInputSchema = addressCreateSchema.merge(ownerSchema)
const updateInputSchema = addressUpdateSchema.merge(ownerSchema).extend({ id: z.string().uuid() })
const deleteInputSchema = ownerSchema.extend({ id: z.string().uuid() })

function assertOwnerScope(ctx: CommandRuntimeContext, owner: Owner) {
  if (ctx.systemActor !== true) throw badRequest('[internal] storefront address commands require a storefront system context')
  ensureTenantScope(ctx, owner.tenantId)
  ensureOrganizationScope(ctx, owner.organizationId)
}

function emOf(ctx: CommandRuntimeContext): EntityManager {
  return (ctx.container.resolve('em') as EntityManager).fork()
}

async function listOwned(em: EntityManager, owner: Owner): Promise<StorefrontAddress[]> {
  return findWithDecryption(
    em,
    StorefrontAddress,
    {
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      customerUserId: owner.customerUserId,
      deletedAt: null,
    } as FilterQuery<StorefrontAddress>,
    { orderBy: { isDefault: 'desc', createdAt: 'asc' } } as never,
    { tenantId: owner.tenantId, organizationId: owner.organizationId },
  )
}

async function loadOwned(em: EntityManager, owner: Owner, id: string): Promise<StorefrontAddress> {
  const address = await findOneWithDecryption(
    em,
    StorefrontAddress,
    {
      id,
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      customerUserId: owner.customerUserId,
      deletedAt: null,
    } as FilterQuery<StorefrontAddress>,
    undefined,
    { tenantId: owner.tenantId, organizationId: owner.organizationId },
  )
  if (!address) throw notFound('Address not found')
  return address
}

function clearOtherDefaults(addresses: StorefrontAddress[], keepId: string) {
  for (const address of addresses) {
    if (String(address.id) !== keepId && address.isDefault) {
      address.isDefault = false
      address.updatedAt = new Date()
    }
  }
}

const createAddressCommand: CommandHandler<z.input<typeof createInputSchema>, SerializedAddress> = {
  id: STOREFRONT_ADDRESS_CREATE_COMMAND,
  async execute(rawInput, ctx) {
    const input = createInputSchema.parse(rawInput)
    assertOwnerScope(ctx, input)
    const em = emOf(ctx)
    const existing = await listOwned(em, input)
    if (existing.length >= MAX_ADDRESSES) throw badRequest('Address book is full')
    const isDefault = input.isDefault ?? existing.length === 0
    const now = new Date()
    const address = em.create(StorefrontAddress, {
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      customerUserId: input.customerUserId,
      fullName: input.fullName,
      phone: input.phone,
      line1: input.line1,
      line2: input.line2 ?? null,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      country: input.country,
      isDefault,
      createdAt: now,
      updatedAt: now,
    })
    await em.flush()
    if (isDefault) {
      clearOtherDefaults(existing, String(address.id))
      await em.flush()
    }
    return serializeAddress(address)
  },
}

const updateAddressCommand: CommandHandler<z.input<typeof updateInputSchema>, SerializedAddress> = {
  id: STOREFRONT_ADDRESS_UPDATE_COMMAND,
  async execute(rawInput, ctx) {
    const input = updateInputSchema.parse(rawInput)
    assertOwnerScope(ctx, input)
    const em = emOf(ctx)
    const address = await loadOwned(em, input, input.id)
    if (input.fullName !== undefined) address.fullName = input.fullName
    if (input.phone !== undefined) address.phone = input.phone
    if (input.line1 !== undefined) address.line1 = input.line1
    if (input.line2 !== undefined) address.line2 = input.line2 ?? null
    if (input.city !== undefined) address.city = input.city
    if (input.state !== undefined) address.state = input.state
    if (input.postalCode !== undefined) address.postalCode = input.postalCode
    if (input.isDefault === true && !address.isDefault) {
      address.isDefault = true
      clearOtherDefaults(await listOwned(em, input), String(address.id))
    }
    address.updatedAt = new Date()
    await em.flush()
    return serializeAddress(address)
  },
}

const deleteAddressCommand: CommandHandler<z.input<typeof deleteInputSchema>, { ok: true }> = {
  id: STOREFRONT_ADDRESS_DELETE_COMMAND,
  async execute(rawInput, ctx) {
    const input = deleteInputSchema.parse(rawInput)
    assertOwnerScope(ctx, input)
    const em = emOf(ctx)
    const address = await loadOwned(em, input, input.id)
    const wasDefault = address.isDefault
    address.deletedAt = new Date()
    address.isDefault = false
    address.updatedAt = new Date()
    await em.flush()
    if (wasDefault) {
      const [next] = await listOwned(em, input)
      if (next) {
        next.isDefault = true
        next.updatedAt = new Date()
        await em.flush()
      }
    }
    return { ok: true }
  },
}

registerCommand(createAddressCommand)
registerCommand(updateAddressCommand)
registerCommand(deleteAddressCommand)
