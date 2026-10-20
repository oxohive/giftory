import { describe, expect, it, jest } from '@jest/globals'
import type { DealerOrderAssignment } from '../data/entities'
import { listAssignmentHistory } from '../commands/assignments'

const ORDER_ID = 'eeeeeeee-0000-4000-a000-000000000001'
const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'

function makeAssignment(overrides: Partial<DealerOrderAssignment>): DealerOrderAssignment {
  return {
    id: 'id',
    orderId: ORDER_ID,
    dealerProfileId: 'dealer-1',
    tenantId: TENANT_ID,
    organizationId: 'org-1',
    assignedBy: 'admin-1',
    assignedAt: new Date('2026-01-01'),
    requiredBy: '2026-02-01',
    status: 'cancelled',
    statusUpdatedAt: new Date('2026-01-01'),
    statusNote: null,
    cancelledReason: null,
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  } as DealerOrderAssignment
}

describe('listAssignmentHistory', () => {
  it('returns every row for the order — including cancelled/superseded ones — never filtering by status', async () => {
    const rows = [
      makeAssignment({ id: 'current', dealerProfileId: 'dealer-2', status: 'in_production', cancelledReason: null }),
      makeAssignment({ id: 'superseded-1', dealerProfileId: 'dealer-1', status: 'cancelled', cancelledReason: 'Reassigned to a different dealer' }),
    ]
    const em = { find: jest.fn().mockResolvedValue(rows) }

    const result = await listAssignmentHistory(em as never, ORDER_ID, TENANT_ID)

    expect(result).toHaveLength(2)
    expect(result.map((r) => r.id)).toEqual(['current', 'superseded-1'])
    expect(result.find((r) => r.id === 'superseded-1')?.status).toBe('cancelled')
    expect(result.find((r) => r.id === 'superseded-1')?.cancelledReason).toBe('Reassigned to a different dealer')

    expect(em.find).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orderId: ORDER_ID, tenantId: TENANT_ID }),
      expect.objectContaining({ orderBy: { assignedAt: 'DESC' } }),
    )
    // The query filter itself must never include a `status` key — a
    // status-filtered query would silently turn "history" back into
    // "current only".
    const [, where] = em.find.mock.calls[0]
    expect(Object.keys(where as Record<string, unknown>)).not.toContain('status')
  })

  it('scopes strictly to the given order and tenant', async () => {
    const em = { find: jest.fn().mockResolvedValue([]) }
    await listAssignmentHistory(em as never, ORDER_ID, TENANT_ID)
    expect(em.find).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orderId: ORDER_ID, tenantId: TENANT_ID }),
      expect.anything(),
    )
  })
})
