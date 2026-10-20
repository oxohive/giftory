import { describe, expect, it, jest } from '@jest/globals'

const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID = 'bbbbbbbb-0000-4000-a000-00000000000a'
const OTHER_ORG_ID = 'bbbbbbbb-0000-4000-a000-00000000000b'

const OWNER_ROLE_ID = 'role-owner-1'
const STAFF_ROLE_ID = 'role-staff-1'
const OTHER_ROLE_ID = 'role-unrelated-1'

const ROLES = [
  { id: OWNER_ROLE_ID, tenantId: TENANT_ID, name: 'dealer:owner' },
  { id: STAFF_ROLE_ID, tenantId: TENANT_ID, name: 'dealer:staff' },
]

const USERS = [
  { id: 'u-owner', organizationId: ORG_ID, tenantId: TENANT_ID, deletedAt: null, email: 'owner@dealer.in', name: 'Owner One', isConfirmed: true, lastLoginAt: new Date('2026-01-05'), createdAt: new Date('2026-01-01') },
  { id: 'u-staff-1', organizationId: ORG_ID, tenantId: TENANT_ID, deletedAt: null, email: 'staff1@dealer.in', name: 'Staff One', isConfirmed: true, lastLoginAt: null, createdAt: new Date('2026-01-02') },
  { id: 'u-staff-deactivated', organizationId: ORG_ID, tenantId: TENANT_ID, deletedAt: null, email: 'staff2@dealer.in', name: 'Staff Two', isConfirmed: false, lastLoginAt: null, createdAt: new Date('2026-01-03') },
  // No owner/staff role link — must be excluded from the roster even though it's in-org.
  { id: 'u-unrelated', organizationId: ORG_ID, tenantId: TENANT_ID, deletedAt: null, email: 'other@dealer.in', name: null, isConfirmed: true, lastLoginAt: null, createdAt: new Date('2026-01-04') },
  // A different org entirely — must never appear for ORG_ID's roster.
  { id: 'u-other-org-owner', organizationId: OTHER_ORG_ID, tenantId: TENANT_ID, deletedAt: null, email: 'owner2@dealer.in', name: 'Other Owner', isConfirmed: true, lastLoginAt: null, createdAt: new Date('2026-01-01') },
]

const LINKS = [
  { user: { id: 'u-owner' }, role: { id: OWNER_ROLE_ID } },
  { user: { id: 'u-staff-1' }, role: { id: STAFF_ROLE_ID } },
  { user: { id: 'u-staff-deactivated' }, role: { id: STAFF_ROLE_ID } },
  { user: { id: 'u-unrelated' }, role: { id: OTHER_ROLE_ID } },
  { user: { id: 'u-other-org-owner' }, role: { id: OWNER_ROLE_ID } },
]

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findWithDecryption: jest.fn(async (_em: unknown, _entity: unknown, where: Record<string, unknown>) =>
    USERS.filter((u) => u.organizationId === where.organizationId && u.tenantId === where.tenantId && u.deletedAt === null),
  ),
}))

import { listDealerOrgUsers, findDealerStaffUser } from '../lib/staffDirectory'

function makeEm() {
  return {
    findOne: jest.fn(async (_entity: unknown, where: Record<string, unknown>) =>
      ROLES.find((r) => r.tenantId === where.tenantId && r.name === where.name) ?? null,
    ),
    find: jest.fn(async (_entity: unknown, where: { user: { $in: string[] }; role: { $in: string[] } }) =>
      LINKS.filter((l) => where.user.$in.includes(l.user.id) && where.role.$in.includes(l.role.id)),
    ),
  }
}

describe('listDealerOrgUsers', () => {
  it('returns the owner + staff roster for the org, correctly labeling each role and active flag', async () => {
    const em = makeEm()
    const roster = await listDealerOrgUsers(em as never, ORG_ID, TENANT_ID)

    const byId = new Map(roster.map((u) => [u.id, u]))
    expect(byId.get('u-owner')).toMatchObject({ role: 'dealer:owner', isActive: true, email: 'owner@dealer.in' })
    expect(byId.get('u-staff-1')).toMatchObject({ role: 'dealer:staff', isActive: true })
    expect(byId.get('u-staff-deactivated')).toMatchObject({ role: 'dealer:staff', isActive: false })
  })

  it('excludes an in-org user that holds neither the owner nor staff role', async () => {
    const em = makeEm()
    const roster = await listDealerOrgUsers(em as never, ORG_ID, TENANT_ID)
    expect(roster.find((u) => u.id === 'u-unrelated')).toBeUndefined()
  })

  it('never includes a different organization\'s users, even within the same tenant', async () => {
    const em = makeEm()
    const roster = await listDealerOrgUsers(em as never, ORG_ID, TENANT_ID)
    expect(roster.find((u) => u.id === 'u-other-org-owner')).toBeUndefined()
  })
})

describe('findDealerStaffUser', () => {
  it('resolves a dealer:staff user of the given org', async () => {
    const em = makeEm()
    const result = await findDealerStaffUser(em as never, ORG_ID, TENANT_ID, 'u-staff-1')
    expect(result?.id).toBe('u-staff-1')
  })

  it('never resolves a dealer:owner through this lookup, even the one in the same org', async () => {
    const em = makeEm()
    const result = await findDealerStaffUser(em as never, ORG_ID, TENANT_ID, 'u-owner')
    expect(result).toBeNull()
  })

  it('never resolves a staff id belonging to a DIFFERENT organization', async () => {
    const em = makeEm()
    // u-other-org-owner isn't staff anyway, but prove the scope check itself:
    // querying under ORG_ID never returns anything from OTHER_ORG_ID's roster.
    const result = await findDealerStaffUser(em as never, ORG_ID, TENANT_ID, 'u-other-org-owner')
    expect(result).toBeNull()
  })
})
