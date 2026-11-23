import { beforeEach, describe, expect, it, jest } from '@jest/globals'

/**
 * gift_catalog commands (FEAT-001/002/007): gift profiles and occasions are
 * written only inside the trusted tenant/organization scope; payload scope is
 * honoured only for system actors; codes are unique per org; soft-deleted rows
 * are revived instead of duplicated; undo never crosses scopes.
 * The REAL registered handlers are executed through `commandRegistry`.
 */

type Row = Record<string, unknown>

class MockCatalogProduct {}
class MockGiftProductProfile {}
class MockGiftOccasion {}

const emitCrudSideEffects = jest.fn<(args: Row) => Promise<void>>()
const emitCrudUndoSideEffects = jest.fn<(args: Row) => Promise<void>>()

jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))
jest.mock('@open-mercato/shared/lib/commands/helpers', () => {
  const actual = jest.requireActual('@open-mercato/shared/lib/commands/helpers') as Record<string, unknown>
  return {
    ...actual,
    emitCrudSideEffects: (args: Row) => emitCrudSideEffects(args),
    emitCrudUndoSideEffects: (args: Row) => emitCrudUndoSideEffects(args),
  }
})
jest.mock('@open-mercato/core/modules/catalog/data/entities', () => ({ CatalogProduct: MockCatalogProduct }))
jest.mock('../data/entities', () => ({ GiftProductProfile: MockGiftProductProfile, GiftOccasion: MockGiftOccasion }))
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findOneWithDecryption: async (_em: unknown, entity: unknown, where: Row) => db.query(entity, where)[0] ?? null,
}))

import { commandRegistry, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import '../commands/profiles'
import '../commands/occasions'
import { resolveCommandScope, resolveUndoScope } from '../commands/shared'
import {
  GIFT_OCCASION_CREATE_COMMAND,
  GIFT_OCCASION_DELETE_COMMAND,
  GIFT_OCCASION_UPDATE_COMMAND,
  GIFT_PROFILE_CREATE_COMMAND,
  GIFT_PROFILE_DELETE_COMMAND,
  GIFT_PROFILE_UPDATE_COMMAND,
} from '../lib/constants'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'
const OTHER_TENANT = '33333333-3333-4333-8333-333333333333'
const OTHER_ORG = '44444444-4444-4444-8444-444444444444'
const PRODUCT = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b'
const PROFILE_ID = 'aaaaaaaa-0000-4000-8000-000000000001'

let seq = 0
const nextId = () => `bbbbbbbb-0000-4000-8000-${String(++seq).padStart(12, '0')}`

const db = {
  products: [] as Row[],
  profiles: [] as Row[],
  occasions: [] as Row[],
  store(entity: unknown): Row[] {
    if (entity === MockCatalogProduct) return db.products
    if (entity === MockGiftProductProfile) return db.profiles
    if (entity === MockGiftOccasion) return db.occasions
    return []
  },
  query(entity: unknown, where: Row): Row[] {
    return db.store(entity).filter((row) => Object.entries(where).every(([key, value]) => (row[key] ?? null) === value))
  },
}

const em = { findOne: jest.fn(async (entity: unknown, where: Row) => db.query(entity, where)[0] ?? null) }
const dataEngine = {
  createOrmEntity: jest.fn(async ({ entity, data }: { entity: unknown; data: Row }) => {
    const row = { id: nextId(), deletedAt: null, updatedAt: new Date('2026-10-01T00:00:00Z'), ...data }
    db.store(entity).push(row)
    return row
  }),
  updateOrmEntity: jest.fn(async ({ entity, where, apply }: { entity: unknown; where: Row; apply: (row: Row) => void }) => {
    const row = db.query(entity, where)[0]
    if (!row) return null
    apply(row)
    return row
  }),
  deleteOrmEntity: jest.fn(async ({ entity, where }: { entity: unknown; where: Row }) => {
    const row = db.query(entity, where)[0]
    if (!row) return null
    row.deletedAt = new Date()
    return row
  }),
}
const container = {
  resolve: (name: string) => {
    if (name === 'em') return em
    if (name === 'dataEngine') return dataEngine
    throw new Error(`unexpected ${name}`)
  },
}

function staffCtx(overrides: Partial<CommandRuntimeContext> = {}): CommandRuntimeContext {
  return {
    container: container as never,
    auth: { sub: 'staff-1', tenantId: TENANT, orgId: ORG, isSuperAdmin: false } as never,
    organizationScope: null,
    selectedOrganizationId: ORG,
    organizationIds: [ORG],
    ...overrides,
  }
}

/** CLI seeding / tenant setup context: no session, scope comes from the command input. */
function systemCtx(): CommandRuntimeContext {
  return { container: container as never, auth: null, organizationScope: null, selectedOrganizationId: null, organizationIds: null, systemActor: true }
}

async function run(commandId: string, input: Row, ctx: CommandRuntimeContext = staffCtx()) {
  const handler = commandRegistry.get(commandId)!
  if (handler.prepare) await handler.prepare(input as never, ctx)
  return (await handler.execute(input as never, ctx)) as Row
}

function product(overrides: Row = {}) {
  const row = { id: PRODUCT, tenantId: TENANT, organizationId: ORG, deletedAt: null, ...overrides }
  db.products.push(row)
  return row
}

function profile(overrides: Row = {}) {
  const row = {
    id: PROFILE_ID,
    tenantId: TENANT,
    organizationId: ORG,
    productId: PRODUCT,
    occasions: ['birthday'],
    recipientTypes: ['her'],
    isCustomizable: false,
    proofRequired: false,
    giftWrapAvailable: false,
    giftMessageMaxLength: 250,
    productionLeadTimeDays: null,
    personalizationNotes: null,
    fulfillmentMode: 'dealer',
    deletedAt: null,
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    ...overrides,
  }
  db.profiles.push(row)
  return row
}

function occasion(overrides: Row = {}) {
  const row = {
    id: nextId(),
    tenantId: TENANT,
    organizationId: ORG,
    code: 'birthday',
    label: 'Birthday',
    description: null,
    sortOrder: 10,
    isActive: true,
    imageUrl: null,
    deletedAt: null,
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    ...overrides,
  }
  db.occasions.push(row)
  return row
}

beforeEach(() => {
  db.products = []
  db.profiles = []
  db.occasions = []
  emitCrudSideEffects.mockReset()
  emitCrudUndoSideEffects.mockReset()
  dataEngine.createOrmEntity.mockClear()
  dataEngine.updateOrmEntity.mockClear()
})

describe('resolveCommandScope', () => {
  it('takes scope from the staff session and ignores payload scope', () => {
    expect(resolveCommandScope(staffCtx(), { tenantId: OTHER_TENANT, organizationId: OTHER_ORG })).toEqual({ tenantId: TENANT, organizationId: ORG })
  })

  it('honours input scope only for system actors', () => {
    expect(resolveCommandScope(systemCtx(), { tenantId: TENANT, organizationId: ORG })).toEqual({ tenantId: TENANT, organizationId: ORG })
    expect(() =>
      resolveCommandScope({ container: container as never, auth: null, organizationScope: null, selectedOrganizationId: null, organizationIds: null }, { tenantId: TENANT, organizationId: ORG }),
    ).toThrow(/tenant scope/)
  })

  it('fails closed without an organization', () => {
    expect(() => resolveCommandScope(staffCtx({ selectedOrganizationId: null, auth: { sub: 's', tenantId: TENANT, orgId: null } as never }))).toThrow(
      /organization scope/,
    )
  })

  it('rejects an organization outside the caller’s allowed set', () => {
    expect(() =>
      resolveCommandScope(
        staffCtx({ selectedOrganizationId: OTHER_ORG, organizationScope: { selectedId: OTHER_ORG, tenantId: TENANT, allowedIds: [ORG], filterIds: [ORG] } as never }),
      ),
    ).toThrow()
  })

  it('undo is refused from another tenant or organization', () => {
    expect(() => resolveUndoScope(staffCtx(), { tenantId: OTHER_TENANT, organizationId: ORG })).toThrow()
    expect(() => resolveUndoScope(staffCtx(), { tenantId: TENANT, organizationId: OTHER_ORG })).toThrow()
    expect(resolveUndoScope(staffCtx(), { tenantId: TENANT, organizationId: ORG })).toEqual({ tenantId: TENANT, organizationId: ORG })
  })
})

describe('gift profile commands', () => {
  it('creates a profile for a product of the same organization, with documented defaults', async () => {
    product()
    const created = await run(GIFT_PROFILE_CREATE_COMMAND, { productId: PRODUCT, giftWrapAvailable: true, tenantId: OTHER_TENANT, organizationId: OTHER_ORG })
    expect(created).toMatchObject({
      tenantId: TENANT,
      organizationId: ORG,
      productId: PRODUCT,
      giftWrapAvailable: true,
      giftMessageMaxLength: 250,
      fulfillmentMode: 'dealer',
      occasions: [],
    })
    expect(emitCrudSideEffects).toHaveBeenCalledWith(expect.objectContaining({ action: 'created', identifiers: { id: created.id, tenantId: TENANT, organizationId: ORG } }))
  })

  it("refuses to attach a profile to another organization's (or a deleted) product", async () => {
    product({ organizationId: OTHER_ORG })
    await expect(run(GIFT_PROFILE_CREATE_COMMAND, { productId: PRODUCT })).rejects.toMatchObject({ status: 404 })
    db.products = []
    product({ deletedAt: new Date() })
    await expect(run(GIFT_PROFILE_CREATE_COMMAND, { productId: PRODUCT })).rejects.toMatchObject({ status: 404 })
    expect(db.profiles).toHaveLength(0)
  })

  it('rejects a second live profile for the same product (409)', async () => {
    product()
    profile()
    await expect(run(GIFT_PROFILE_CREATE_COMMAND, { productId: PRODUCT })).rejects.toMatchObject({ status: 409 })
  })

  it('revives a soft-deleted profile instead of inserting a duplicate', async () => {
    product()
    const old = profile({ deletedAt: new Date(), giftWrapAvailable: false })
    const revived = await run(GIFT_PROFILE_CREATE_COMMAND, { productId: PRODUCT, giftWrapAvailable: true })
    expect(revived).toBe(old)
    expect(old).toMatchObject({ deletedAt: null, giftWrapAvailable: true })
    expect(db.profiles).toHaveLength(1)
    expect(dataEngine.createOrmEntity).not.toHaveBeenCalled()
  })

  it('validates gift message limits and vocabularies', async () => {
    product()
    await expect(run(GIFT_PROFILE_CREATE_COMMAND, { productId: PRODUCT, giftMessageMaxLength: 2001 })).rejects.toThrow()
    await expect(run(GIFT_PROFILE_CREATE_COMMAND, { productId: PRODUCT, occasions: ['halloween'] })).rejects.toThrow()
  })

  it('updates only provided fields', async () => {
    const row = profile()
    await run(GIFT_PROFILE_UPDATE_COMMAND, { id: PROFILE_ID, giftMessageMaxLength: 40, isCustomizable: true })
    expect(row).toMatchObject({ giftMessageMaxLength: 40, isCustomizable: true, occasions: ['birthday'], giftWrapAvailable: false })
  })

  it("returns 404 when updating another organization's profile", async () => {
    const row = profile({ organizationId: OTHER_ORG })
    await expect(run(GIFT_PROFILE_UPDATE_COMMAND, { id: PROFILE_ID, giftWrapAvailable: true })).rejects.toMatchObject({ status: 404 })
    expect(row.giftWrapAvailable).toBe(false)
  })

  it('rejects a stale optimistic-lock version with 409', async () => {
    profile()
    const request = new Request('http://x', { headers: { 'x-om-ext-optimistic-lock-expected-updated-at': '2026-09-01T00:00:00.000Z' } })
    await expect(run(GIFT_PROFILE_UPDATE_COMMAND, { id: PROFILE_ID, isCustomizable: true }, staffCtx({ request }))).rejects.toMatchObject({ status: 409 })
  })

  it('soft-deletes, and 404s for missing profiles', async () => {
    const row = profile()
    await run(GIFT_PROFILE_DELETE_COMMAND, { id: PROFILE_ID })
    expect(row.deletedAt).toBeInstanceOf(Date)
    expect(db.profiles).toHaveLength(1)
    await expect(run(GIFT_PROFILE_DELETE_COMMAND, { id: PROFILE_ID })).rejects.toMatchObject({ status: 404 })
  })

  it('undo of a create soft-deletes the profile in its original scope only', async () => {
    const row = profile()
    const handler = commandRegistry.get(GIFT_PROFILE_CREATE_COMMAND)!
    const snapshot = { id: PROFILE_ID, tenantId: TENANT, organizationId: ORG }
    await handler.undo!({ logEntry: { snapshotAfter: snapshot } as never, ctx: staffCtx() } as never)
    expect(row.deletedAt).toBeInstanceOf(Date)

    row.deletedAt = null
    const foreignCtx = staffCtx({ auth: { sub: 's', tenantId: OTHER_TENANT, orgId: OTHER_ORG } as never, selectedOrganizationId: OTHER_ORG })
    await expect(handler.undo!({ logEntry: { snapshotAfter: snapshot } as never, ctx: foreignCtx } as never)).rejects.toThrow()
    expect(row.deletedAt).toBeNull()
  })
})

describe('gift occasion commands', () => {
  it('creates an occasion in the caller scope with a normalized code', async () => {
    const created = await run(GIFT_OCCASION_CREATE_COMMAND, { code: ' Diwali ', label: 'Diwali', organizationId: OTHER_ORG })
    expect(created).toMatchObject({ code: 'diwali', tenantId: TENANT, organizationId: ORG, isActive: true, sortOrder: 0 })
  })

  it('keeps codes unique per organization but allows the same code elsewhere', async () => {
    occasion()
    await expect(run(GIFT_OCCASION_CREATE_COMMAND, { code: 'birthday', label: 'Bday' })).rejects.toMatchObject({ status: 409 })
    db.occasions = [occasion({ organizationId: OTHER_ORG })]
    await expect(run(GIFT_OCCASION_CREATE_COMMAND, { code: 'birthday', label: 'Bday' })).resolves.toMatchObject({ organizationId: ORG })
  })

  it('revives a deleted occasion with the same code', async () => {
    const old = occasion({ deletedAt: new Date(), label: 'Old' })
    const revived = await run(GIFT_OCCASION_CREATE_COMMAND, { code: 'birthday', label: 'Birthday' })
    expect(revived).toBe(old)
    expect(old).toMatchObject({ deletedAt: null, label: 'Birthday' })
  })

  it('deactivating hides without deleting; renaming to a taken code is a conflict', async () => {
    const birthday = occasion()
    occasion({ code: 'wedding', label: 'Wedding' })
    await run(GIFT_OCCASION_UPDATE_COMMAND, { id: birthday.id, isActive: false })
    expect(birthday).toMatchObject({ isActive: false, deletedAt: null })
    await expect(run(GIFT_OCCASION_UPDATE_COMMAND, { id: birthday.id, code: 'wedding' })).rejects.toMatchObject({ status: 409 })
    expect(birthday.code).toBe('birthday')
  })

  it("cannot update or delete another organization's occasion", async () => {
    const foreign = occasion({ organizationId: OTHER_ORG })
    await expect(run(GIFT_OCCASION_UPDATE_COMMAND, { id: foreign.id, label: 'Hacked' })).rejects.toMatchObject({ status: 404 })
    await expect(run(GIFT_OCCASION_DELETE_COMMAND, { id: foreign.id })).rejects.toMatchObject({ status: 404 })
    expect(foreign).toMatchObject({ label: 'Birthday', deletedAt: null })
  })

  it('rejects unsafe image URLs', async () => {
    await expect(run(GIFT_OCCASION_CREATE_COMMAND, { code: 'x', label: 'X', imageUrl: 'javascript:alert(1)' })).rejects.toThrow()
    await expect(run(GIFT_OCCASION_CREATE_COMMAND, { code: 'y', label: 'Y', imageUrl: '/images/y.png' })).resolves.toMatchObject({ imageUrl: '/images/y.png' })
  })
})
