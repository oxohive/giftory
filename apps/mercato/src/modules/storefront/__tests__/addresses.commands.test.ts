import { beforeEach, describe, expect, it, jest } from '@jest/globals'

/**
 * Address book commands (FEAT-005 req. 5): add, edit, delete, set-as-default.
 * The owner is carried on the command input by the storefront routes and is
 * only honoured in a storefront system context pinned to that organization.
 * The REAL registered handlers are exercised through `commandRegistry`.
 */

type Row = Record<string, unknown>

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findWithDecryption: async (em: FakeEm, _entity: unknown, where: Row) => em.query(where),
  findOneWithDecryption: async (em: FakeEm, _entity: unknown, where: Row) => em.query(where)[0] ?? null,
}))

import { commandRegistry, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import '../commands/addresses'
import {
  STOREFRONT_ADDRESS_CREATE_COMMAND,
  STOREFRONT_ADDRESS_DELETE_COMMAND,
  STOREFRONT_ADDRESS_UPDATE_COMMAND,
} from '../lib/constants'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'
const OTHER_ORG = '44444444-4444-4444-8444-444444444444'
const OWNER = 'cccccccc-0000-4000-8000-000000000001'
const OTHER_OWNER = 'cccccccc-0000-4000-8000-000000000002'

let seq = 0
const nextId = () => `aaaaaaaa-0000-4000-8000-${String(++seq).padStart(12, '0')}`

class FakeEm {
  rows: Row[] = []
  flush = jest.fn(async () => undefined)
  fork = () => this

  query(where: Row): Row[] {
    return this.rows
      .filter((row) => Object.entries(where).every(([key, value]) => (row[key] ?? null) === value))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime())
  }

  create = jest.fn((_entity: unknown, data: Row) => {
    const row = { id: nextId(), deletedAt: null, ...data }
    this.rows.push(row)
    return row
  })
}

let em: FakeEm

function ctx(overrides: Partial<CommandRuntimeContext> = {}): CommandRuntimeContext {
  return {
    container: { resolve: (name: string) => (name === 'em' ? em : null) } as never,
    auth: null,
    organizationScope: null,
    selectedOrganizationId: ORG,
    organizationIds: [ORG],
    systemActor: true,
    ...overrides,
  }
}

const fields = {
  fullName: 'Asha Rao',
  phone: '9876543210',
  line1: '12 MG Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
  country: 'IN',
}

function run(id: string, input: Row, context = ctx()) {
  const handler = commandRegistry.get(id)
  if (!handler) throw new Error(`not registered: ${id}`)
  return handler.execute(input, context) as Promise<Row>
}

function owner(customerUserId = OWNER, organizationId = ORG) {
  return { tenantId: TENANT, organizationId, customerUserId }
}

function seedAddress(overrides: Row = {}): Row {
  const row = {
    id: nextId(),
    ...owner(),
    ...fields,
    line2: null,
    isDefault: false,
    deletedAt: null,
    createdAt: new Date(Date.now() - 10_000 + seq),
    updatedAt: new Date(),
    ...overrides,
  }
  em.rows.push(row)
  return row
}

beforeEach(() => {
  em = new FakeEm()
})

describe('storefront address commands — trust boundary', () => {
  it('refuse to run outside a storefront system context', async () => {
    await expect(run(STOREFRONT_ADDRESS_CREATE_COMMAND, { ...fields, ...owner() }, ctx({ systemActor: false }))).rejects.toMatchObject({ status: 400 })
    expect(em.rows).toHaveLength(0)
  })

  it('refuse an owner from another organization than the context is pinned to', async () => {
    await expect(run(STOREFRONT_ADDRESS_CREATE_COMMAND, { ...fields, ...owner(OWNER, OTHER_ORG) })).rejects.toMatchObject({ status: 403 })
    expect(em.rows).toHaveLength(0)
  })

  it('require a complete, valid owner', async () => {
    await expect(run(STOREFRONT_ADDRESS_CREATE_COMMAND, { ...fields, tenantId: TENANT, organizationId: ORG })).rejects.toThrow()
    await expect(run(STOREFRONT_ADDRESS_CREATE_COMMAND, { ...fields, ...owner('not-a-uuid') })).rejects.toThrow()
  })
})

describe('create', () => {
  it('makes the first address the default and returns the wire shape', async () => {
    const created = await run(STOREFRONT_ADDRESS_CREATE_COMMAND, { ...fields, line2: '  ', ...owner() })
    expect(created).toMatchObject({ fullName: 'Asha Rao', line2: '', country: 'IN', isDefault: true })
    expect(em.rows[0]).toMatchObject({ tenantId: TENANT, organizationId: ORG, customerUserId: OWNER, line2: null })
  })

  it('keeps the existing default unless the new address asks to be default', async () => {
    const first = seedAddress({ isDefault: true })
    const second = await run(STOREFRONT_ADDRESS_CREATE_COMMAND, { ...fields, ...owner() })
    expect(second.isDefault).toBe(false)
    expect(first.isDefault).toBe(true)
    const third = await run(STOREFRONT_ADDRESS_CREATE_COMMAND, { ...fields, isDefault: true, ...owner() })
    expect(third.isDefault).toBe(true)
    expect(first.isDefault).toBe(false)
  })

  it("never touches another customer's default", async () => {
    const theirs = seedAddress({ customerUserId: OTHER_OWNER, isDefault: true })
    await run(STOREFRONT_ADDRESS_CREATE_COMMAND, { ...fields, isDefault: true, ...owner() })
    expect(theirs.isDefault).toBe(true)
  })

  it('caps the address book at 50 entries', async () => {
    for (let index = 0; index < 50; index += 1) seedAddress()
    await expect(run(STOREFRONT_ADDRESS_CREATE_COMMAND, { ...fields, ...owner() })).rejects.toMatchObject({ status: 400 })
  })
})

describe('update', () => {
  it('edits only provided fields and can switch the default', async () => {
    const home = seedAddress({ isDefault: true })
    const office = seedAddress({ line1: 'Office Park' })
    const updated = await run(STOREFRONT_ADDRESS_UPDATE_COMMAND, { id: office.id, city: 'Mysuru', isDefault: true, ...owner() })
    expect(updated).toMatchObject({ city: 'Mysuru', line1: 'Office Park', isDefault: true })
    expect(home.isDefault).toBe(false)
  })

  it("returns 404 for another customer's address (no cross-account edits)", async () => {
    const theirs = seedAddress({ customerUserId: OTHER_OWNER })
    await expect(run(STOREFRONT_ADDRESS_UPDATE_COMMAND, { id: theirs.id, city: 'Hacked', ...owner() })).rejects.toMatchObject({ status: 404 })
    expect(theirs.city).toBe('Bengaluru')
  })

  it('returns 404 for a deleted address', async () => {
    const gone = seedAddress({ deletedAt: new Date() })
    await expect(run(STOREFRONT_ADDRESS_UPDATE_COMMAND, { id: gone.id, city: 'Mysuru', ...owner() })).rejects.toMatchObject({ status: 404 })
  })
})

describe('delete', () => {
  it('soft-deletes and promotes the next address to default', async () => {
    const home = seedAddress({ isDefault: true })
    const office = seedAddress()
    await expect(run(STOREFRONT_ADDRESS_DELETE_COMMAND, { id: home.id, ...owner() })).resolves.toEqual({ ok: true })
    expect(home.deletedAt).toBeInstanceOf(Date)
    expect(home.isDefault).toBe(false)
    expect(em.rows).toContain(home) // soft delete: the row stays
    expect(office.isDefault).toBe(true)
  })

  it("returns 404 for another customer's address", async () => {
    const theirs = seedAddress({ customerUserId: OTHER_OWNER })
    await expect(run(STOREFRONT_ADDRESS_DELETE_COMMAND, { id: theirs.id, ...owner() })).rejects.toMatchObject({ status: 404 })
    expect(theirs.deletedAt).toBeNull()
  })
})
