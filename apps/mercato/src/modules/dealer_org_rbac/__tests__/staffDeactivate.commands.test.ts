import { describe, expect, it, jest, beforeEach } from '@jest/globals'

jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))

// findOwnProfile (commands/shared.ts) dynamically imports DealerProfile.
jest.mock('@/modules/dealer_onboarding/data/entities', () => ({
  DealerProfile: class MockDealerProfile {},
}))

const findDealerStaffUserMock = jest.fn()
jest.mock('../lib/staffDirectory', () => ({
  findDealerStaffUser: findDealerStaffUserMock,
}))

import { executeStaffDeactivate } from '../commands/staff'

const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID = 'bbbbbbbb-0000-4000-a000-000000000002'
const OWNER_USER_ID = 'cccccccc-0000-4000-a000-000000000001'
const STAFF_USER_ID = 'dddddddd-0000-4000-a000-000000000002'

function makeApprovedProfileEm() {
  return {
    findOne: jest.fn().mockResolvedValue({ id: 'profile-1', organizationId: ORG_ID, tenantId: TENANT_ID, kycStatus: 'approved', deletedAt: null }),
  }
}

function makeCtx(em: { findOne: jest.Mock }, commandBusExecute: jest.Mock) {
  const container = {
    resolve: jest.fn((id: string) => {
      if (id === 'em') return em
      if (id === 'commandBus') return { execute: commandBusExecute }
      throw new Error(`Unknown service: ${id}`)
    }),
  }
  return {
    container,
    auth: { sub: OWNER_USER_ID, tenantId: TENANT_ID, orgId: ORG_ID, isSuperAdmin: false },
    organizationScope: null,
    selectedOrganizationId: ORG_ID,
    organizationIds: [ORG_ID],
    systemActor: false,
  } as unknown as import('@open-mercato/shared/lib/commands').CommandRuntimeContext
}

describe('executeStaffDeactivate', () => {
  beforeEach(() => {
    findDealerStaffUserMock.mockClear()
  })

  it('rejects an owner trying to deactivate themselves, before touching the auth module at all', async () => {
    const em = makeApprovedProfileEm()
    const commandBusExecute = jest.fn()
    const ctx = makeCtx(em, commandBusExecute)

    await expect(executeStaffDeactivate({ userId: OWNER_USER_ID }, ctx)).rejects.toThrow(
      'An owner cannot deactivate their own account',
    )
    expect(findDealerStaffUserMock).not.toHaveBeenCalled()
    expect(commandBusExecute).not.toHaveBeenCalled()
  })

  it('fails closed when the target does not resolve as a dealer:staff member of the caller\'s own org', async () => {
    const em = makeApprovedProfileEm()
    const commandBusExecute = jest.fn()
    findDealerStaffUserMock.mockResolvedValueOnce(null) // different org's user, or an owner, or unknown
    const ctx = makeCtx(em, commandBusExecute)

    await expect(executeStaffDeactivate({ userId: 'eeeeeeee-0000-4000-a000-000000000003' }, ctx)).rejects.toThrow('Staff user not found')
    expect(commandBusExecute).not.toHaveBeenCalled()
  })

  it('calls the installed auth.users.update command with isConfirmed:false — the real revocation flag', async () => {
    const em = makeApprovedProfileEm()
    findDealerStaffUserMock.mockResolvedValueOnce({
      id: STAFF_USER_ID,
      email: 'staff@dealer.in',
      name: 'Staff One',
      role: 'dealer:staff',
      isActive: true,
      lastLoginAt: null,
      createdAt: null,
    })
    const commandBusExecute = jest.fn().mockResolvedValue({ result: { id: STAFF_USER_ID } })
    const ctx = makeCtx(em, commandBusExecute)

    const result = await executeStaffDeactivate({ userId: STAFF_USER_ID }, ctx)

    expect(result).toEqual({ userId: STAFF_USER_ID, deactivated: true })
    expect(commandBusExecute).toHaveBeenCalledWith(
      'auth.users.update',
      expect.objectContaining({
        input: { id: STAFF_USER_ID, isConfirmed: false },
      }),
    )
    // The system-actor context used for the auth call must still carry the
    // caller's real tenant — never an unscoped/global write.
    const [, callArgs] = commandBusExecute.mock.calls[0]
    expect((callArgs.ctx.auth as { tenantId?: string }).tenantId).toBe(TENANT_ID)
    expect(callArgs.ctx.systemActor).toBe(true)
  })

  it('requires the caller to be an approved dealer owner of an org before deactivating anyone', async () => {
    const em = { findOne: jest.fn().mockResolvedValue(null) } // no approved profile for this org
    const commandBusExecute = jest.fn()
    const ctx = makeCtx(em, commandBusExecute)

    await expect(executeStaffDeactivate({ userId: STAFF_USER_ID }, ctx)).rejects.toThrow()
    expect(findDealerStaffUserMock).not.toHaveBeenCalled()
    expect(commandBusExecute).not.toHaveBeenCalled()
  })
})
