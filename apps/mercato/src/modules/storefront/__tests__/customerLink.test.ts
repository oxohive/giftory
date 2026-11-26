import { beforeEach, describe, expect, it, jest } from '@jest/globals'

/**
 * Customer account / guest order -> CRM person linking (G8). Lookups stay
 * inside the shop scope, e-mails are compared case-insensitively, and a
 * concurrent link race resolves to one person.
 */

type Row = Record<string, unknown>

class MockLink {}
class MockCustomerEntity {}
class MockCustomerUser {}

const executeCommand = jest.fn<(container: unknown, id: string, input: Row, ctx: Row) => Promise<unknown>>()
const emitStorefrontEvent = jest.fn<(...args: unknown[]) => Promise<void>>()

jest.mock('../data/entities', () => ({ StorefrontCustomerLink: MockLink }))
jest.mock('@open-mercato/core/modules/customers/data/entities', () => ({ CustomerEntity: MockCustomerEntity }))
jest.mock('@open-mercato/core/modules/customer_accounts/data/entities', () => ({ CustomerUser: MockCustomerUser }))
jest.mock('../events', () => ({ emitStorefrontEvent: (...args: unknown[]) => emitStorefrontEvent(...args) }))
jest.mock('../lib/system', () => ({
  executeCommand: (...args: [unknown, string, Row, Row]) => executeCommand(...args),
  systemCommandContext: (_container: unknown, scope: Row) => ({ systemActor: true, selectedOrganizationId: scope.organizationId }),
}))
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findWithDecryption: async (em: FakeEm, entity: unknown, where: Row) => em.query(entity, where),
  findOneWithDecryption: async (em: FakeEm, entity: unknown, where: Row) => em.query(entity, where)[0] ?? null,
}))

import {
  ensureCustomerPerson,
  findOrCreatePerson,
  findPersonByEmail,
  normalizeIndianPhone,
  readLinkedPersonId,
  splitDisplayName,
} from '../lib/customerLink'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'
const OTHER_ORG = '44444444-4444-4444-8444-444444444444'
const SCOPE = { tenantId: TENANT, organizationId: ORG }
const USER = 'cccccccc-0000-4000-8000-000000000001'

class FakeEm {
  links: Row[] = []
  people: Row[] = []
  users: Row[] = []
  calls: Array<{ entity: unknown; where: Row }> = []
  flush = jest.fn(async () => undefined)
  clear = jest.fn(() => undefined)
  fork = () => this

  store(entity: unknown) {
    if (entity === MockLink) return this.links
    if (entity === MockCustomerEntity) return this.people
    if (entity === MockCustomerUser) return this.users
    return []
  }

  query(entity: unknown, where: Row) {
    this.calls.push({ entity, where })
    return this.store(entity).filter((row) => Object.entries(where).every(([key, value]) => (row[key] ?? null) === value))
  }

  findOne = jest.fn(async (entity: unknown, where: Row) => this.query(entity, where)[0] ?? null)

  create = jest.fn((entity: unknown, data: Row) => {
    const row = { id: `row-${this.store(entity).length + 1}`, ...data }
    this.store(entity).push(row)
    return row
  })
}

let em: FakeEm
const container = { resolve: (name: string) => (name === 'em' ? em : null) }

function person(overrides: Row = {}): Row {
  return { id: 'person-1', tenantId: TENANT, organizationId: ORG, kind: 'person', deletedAt: null, primaryEmail: 'Asha@Example.com', ...overrides }
}

function user(overrides: Row = {}): Row {
  return { id: USER, tenantId: TENANT, organizationId: ORG, deletedAt: null, email: 'asha@example.com', displayName: 'Asha Rao', personEntityId: null, ...overrides }
}

beforeEach(() => {
  em = new FakeEm()
  executeCommand.mockReset()
  executeCommand.mockResolvedValue({ entityId: 'person-new' })
  emitStorefrontEvent.mockReset()
  emitStorefrontEvent.mockResolvedValue(undefined)
})

describe('normalizeIndianPhone / splitDisplayName', () => {
  it('normalizes Indian mobiles to +91XXXXXXXXXX and drops anything else', () => {
    expect(normalizeIndianPhone('98765 43210')).toBe('+919876543210')
    expect(normalizeIndianPhone('+91-98765-43210')).toBe('+919876543210')
    expect(normalizeIndianPhone('5876543210')).toBeNull()
    expect(normalizeIndianPhone('+14155550100')).toBeNull()
    expect(normalizeIndianPhone('')).toBeNull()
    expect(normalizeIndianPhone(null)).toBeNull()
  })

  it('splits names and falls back to the e-mail local part', () => {
    expect(splitDisplayName('  Asha   Rao Kumar ', 'a@x.in')).toEqual({ firstName: 'Asha', lastName: 'Rao Kumar', displayName: 'Asha Rao Kumar' })
    expect(splitDisplayName('Asha', 'a@x.in')).toEqual({ firstName: 'Asha', lastName: '-', displayName: 'Asha' })
    expect(splitDisplayName(null, 'asha.rao@x.in')).toEqual({ firstName: 'asha.rao', lastName: '-', displayName: 'asha.rao' })
  })
})

describe('findPersonByEmail / findOrCreatePerson', () => {
  it('matches e-mails case-insensitively inside the shop only', async () => {
    em.people.push(person({ organizationId: OTHER_ORG, id: 'foreign' }), person())
    expect(await findPersonByEmail(em as never, SCOPE, '  ASHA@example.com ')).toBe('person-1')
    expect(em.calls[0]!.where).toMatchObject({ tenantId: TENANT, organizationId: ORG, kind: 'person', deletedAt: null })
  })

  it('reuses an existing person instead of creating a duplicate', async () => {
    em.people.push(person())
    expect(await findOrCreatePerson(container as never, SCOPE, { email: 'asha@example.com' })).toBe('person-1')
    expect(executeCommand).not.toHaveBeenCalled()
  })

  it('creates a person through customers.people.create in a system context pinned to the shop', async () => {
    expect(await findOrCreatePerson(container as never, SCOPE, { email: ' New@Example.com ', displayName: 'New Shopper', phone: '98765 43210' })).toBe('person-new')
    const [, commandId, input, ctx] = executeCommand.mock.calls[0]!
    expect(commandId).toBe('customers.people.create')
    expect(input).toMatchObject({
      tenantId: TENANT,
      organizationId: ORG,
      primaryEmail: 'new@example.com',
      primaryPhone: '+919876543210',
      firstName: 'New',
      lastName: 'Shopper',
      source: 'storefront',
    })
    expect(ctx).toMatchObject({ systemActor: true, selectedOrganizationId: ORG })
  })

  it('omits invalid phones and returns null for blank e-mails', async () => {
    await findOrCreatePerson(container as never, SCOPE, { email: 'x@y.in', phone: '12345' })
    expect(executeCommand.mock.calls[0]![2]).not.toHaveProperty('primaryPhone')
    expect(await findOrCreatePerson(container as never, SCOPE, { email: '   ' })).toBeNull()
  })
})

describe('ensureCustomerPerson / readLinkedPersonId', () => {
  it('returns an existing valid link without creating anything', async () => {
    em.links.push({ tenantId: TENANT, organizationId: ORG, customerUserId: USER, personEntityId: 'person-1' })
    em.people.push(person())
    expect(await ensureCustomerPerson(container as never, SCOPE, { customerUserId: USER })).toBe('person-1')
    expect(executeCommand).not.toHaveBeenCalled()
    expect(emitStorefrontEvent).not.toHaveBeenCalled()
  })

  it('returns null for an account that does not exist in this shop', async () => {
    em.users.push(user({ organizationId: OTHER_ORG }))
    expect(await ensureCustomerPerson(container as never, SCOPE, { customerUserId: USER })).toBeNull()
    expect(em.links).toHaveLength(0)
  })

  it('links the person found by e-mail and emits storefront.customer.linked', async () => {
    em.users.push(user())
    em.people.push(person())
    expect(await ensureCustomerPerson(container as never, SCOPE, { customerUserId: USER })).toBe('person-1')
    expect(em.links[0]).toMatchObject({ tenantId: TENANT, organizationId: ORG, customerUserId: USER, personEntityId: 'person-1' })
    expect(emitStorefrontEvent).toHaveBeenCalledWith('storefront.customer.linked', expect.objectContaining({ customerUserId: USER, personEntityId: 'person-1', tenantId: TENANT }))
  })

  it('creates a person when none matches', async () => {
    em.users.push(user())
    expect(await ensureCustomerPerson(container as never, SCOPE, { customerUserId: USER, phone: '9876543210' })).toBe('person-new')
    expect(executeCommand.mock.calls[0]![2]).toMatchObject({ primaryEmail: 'asha@example.com', primaryPhone: '+919876543210' })
  })

  it('prefers the native CustomerUser.personEntityId when it still exists', async () => {
    em.users.push(user({ personEntityId: 'person-9' }))
    em.people.push(person({ id: 'person-9', primaryEmail: 'other@example.com' }), person())
    expect(await ensureCustomerPerson(container as never, SCOPE, { customerUserId: USER })).toBe('person-9')
  })

  it('resolves a concurrent link race to the winner', async () => {
    em.users.push(user())
    em.people.push(person())
    em.flush.mockImplementationOnce(async () => {
      em.links.splice(0, em.links.length, { tenantId: TENANT, organizationId: ORG, customerUserId: USER, personEntityId: 'person-winner' })
      throw Object.assign(new Error('duplicate'), { code: '23505' })
    })
    expect(await ensureCustomerPerson(container as never, SCOPE, { customerUserId: USER })).toBe('person-winner')
  })

  it('readLinkedPersonId uses the storefront link, then the native account link, never creating', async () => {
    em.users.push(user({ personEntityId: 'person-native' }))
    expect(await readLinkedPersonId(em as never, SCOPE, USER)).toBe('person-native')
    em.links.push({ tenantId: TENANT, organizationId: ORG, customerUserId: USER, personEntityId: 'person-linked' })
    expect(await readLinkedPersonId(em as never, SCOPE, USER)).toBe('person-linked')
    expect(executeCommand).not.toHaveBeenCalled()
  })
})
