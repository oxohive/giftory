import { describe, expect, it, jest } from '@jest/globals'
import type { DealerOrderAssignment } from '../data/entities'
import { buildDealerOrderDetail } from '../commands/assignments'

const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ASSIGNMENT_ID = 'dddddddd-0000-4000-a000-000000000004'
const ORDER_ID = 'eeeeeeee-0000-4000-a000-000000000005'

function makeAssignment(overrides: Partial<DealerOrderAssignment> = {}): DealerOrderAssignment {
  return {
    id: ASSIGNMENT_ID,
    orderId: ORDER_ID,
    dealerProfileId: 'dealer-profile-1',
    tenantId: TENANT_ID,
    organizationId: 'org-1',
    assignedBy: 'admin-1',
    assignedAt: new Date('2026-01-01'),
    requiredBy: '2026-02-01',
    status: 'in_production',
    statusUpdatedAt: new Date('2026-01-02'),
    statusNote: 'Started printing',
    cancelledReason: null,
    updatedAt: new Date('2026-01-02'),
    deletedAt: null,
    ...overrides,
  } as DealerOrderAssignment
}

function makeEm() {
  const execute = jest.fn(async (sql: string) => {
    if (/FROM sales_orders/.test(sql)) return [{ order_number: 'ORD-9001', shipping_address_snapshot: { city: 'Chennai', postalCode: '600001' } }]
    return [{ id: 'line-1', product_id: 'p1', product_variant_id: 'v1', name: 'Mug', quantity: '3', metadata: null, configuration: null, comment: null }]
  })
  return { getConnection: () => ({ execute }) }
}

describe('buildDealerOrderDetail — assignment ID vs sales order ID', () => {
  it('exposes assignmentId and orderId as distinct fields, never conflated under one "id"', async () => {
    const em = makeEm()
    const detail = await buildDealerOrderDetail(em as never, makeAssignment())

    expect(detail.assignmentId).toBe(ASSIGNMENT_ID)
    expect(detail.orderId).toBe(ORDER_ID)
    expect(detail.assignmentId).not.toBe(detail.orderId)
    expect(detail.orderNumber).toBe('ORD-9001')
    // No generic "id" field that could be mistaken for either.
    expect((detail as Record<string, unknown>).id).toBeUndefined()
  })

  it('omits internal scope/audit fields not part of the FEAT-010 safe projection', async () => {
    const em = makeEm()
    const detail = await buildDealerOrderDetail(em as never, makeAssignment())
    const keys = Object.keys(detail)
    expect(keys).not.toContain('dealerProfileId')
    expect(keys).not.toContain('tenantId')
    expect(keys).not.toContain('organizationId')
    expect(keys).not.toContain('assignedBy')
    expect(keys).not.toContain('cancelledReason')
  })

  it('includes product/variant/quantity/city/pincode from the order detail projection', async () => {
    const em = makeEm()
    const detail = await buildDealerOrderDetail(em as never, makeAssignment())
    expect(detail.lines[0]).toMatchObject({ productId: 'p1', variantId: 'v1', quantity: 3 })
    expect(detail.shipping).toEqual({ city: 'Chennai', pincode: '600001' })
    expect(detail.requiredBy).toBe('2026-02-01')
  })
})
