import { describe, expect, it, jest } from '@jest/globals'
import { loadDealerOrderDetail } from '../lib/orderDetails'

const ORDER_ID = 'eeeeeeee-0000-4000-a000-000000000001'
const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'

function makeEm(orderRow: Record<string, unknown> | undefined, lineRows: Array<Record<string, unknown>>) {
  const execute = jest.fn(async (sql: string) => {
    if (/FROM sales_orders/.test(sql)) return orderRow ? [orderRow] : []
    if (/FROM sales_order_lines/.test(sql)) return lineRows
    throw new Error(`Unexpected query: ${sql}`)
  })
  return { getConnection: () => ({ execute }) }
}

describe('loadDealerOrderDetail', () => {
  it('projects only the safe fields: product, variant, quantity, gift message, production requirements, city+pincode', async () => {
    const em = makeEm(
      {
        order_number: 'ORD-1001',
        shipping_address_snapshot: {
          name: 'Jane Customer',
          phone: '+91 90000 00000',
          addressLine1: '12 MG Road',
          city: 'Pune',
          region: 'Maharashtra',
          postalCode: '411001',
          country: 'IN',
        },
      },
      [
        {
          id: 'line-1',
          product_id: 'product-1',
          product_variant_id: 'variant-1',
          name: 'Engraved Steel Mug',
          quantity: '2.0000',
          metadata: { gift: { giftWrap: true, giftMessage: 'Happy Birthday!' } },
          configuration: { engravingText: 'To Rahul', color: 'matte-black' },
          comment: 'Please double-check spelling',
        },
      ],
    )

    const detail = await loadDealerOrderDetail(em as never, ORDER_ID, TENANT_ID)

    expect(detail.orderNumber).toBe('ORD-1001')
    // Only city + pincode — no customer name, phone, or street address.
    expect(detail.shipping).toEqual({ city: 'Pune', pincode: '411001' })
    expect(detail.lines).toHaveLength(1)
    expect(detail.lines[0]).toEqual({
      id: 'line-1',
      productId: 'product-1',
      variantId: 'variant-1',
      name: 'Engraved Steel Mug',
      quantity: 2,
      giftMessage: 'Happy Birthday!',
      productionRequirements: { engravingText: 'To Rahul', color: 'matte-black', note: 'Please double-check spelling' },
    })
    // Explicitly NOT present anywhere in the output: customer PII.
    expect(JSON.stringify(detail)).not.toContain('Jane Customer')
    expect(JSON.stringify(detail)).not.toContain('MG Road')
    expect(JSON.stringify(detail)).not.toContain('90000 00000')
  })

  it('returns null gift message and empty production requirements when neither is present', async () => {
    const em = makeEm(
      { order_number: 'ORD-1002', shipping_address_snapshot: { city: 'Delhi', postalCode: '110001' } },
      [{ id: 'line-2', product_id: 'p2', product_variant_id: null, name: 'Plain Mug', quantity: '1', metadata: null, configuration: null, comment: null }],
    )
    const detail = await loadDealerOrderDetail(em as never, ORDER_ID, TENANT_ID)
    expect(detail.lines[0].giftMessage).toBeNull()
    expect(detail.lines[0].productionRequirements).toBeNull()
    expect(detail.lines[0].variantId).toBeNull()
  })

  it('returns nulls when the order row itself is missing (defensive — the caller already verified the assignment exists)', async () => {
    const em = makeEm(undefined, [])
    const detail = await loadDealerOrderDetail(em as never, ORDER_ID, TENANT_ID)
    expect(detail.orderNumber).toBeNull()
    expect(detail.shipping).toEqual({ city: null, pincode: null })
    expect(detail.lines).toEqual([])
  })

  it('scopes both queries to the given tenant id', async () => {
    const execute = jest.fn(async () => [])
    const em = { getConnection: () => ({ execute }) }
    await loadDealerOrderDetail(em as never, ORDER_ID, TENANT_ID)
    expect(execute).toHaveBeenCalledWith(expect.stringContaining('tenant_id'), [ORDER_ID, TENANT_ID])
    expect(execute).toHaveBeenCalledWith(expect.stringContaining('tenant_id'), [ORDER_ID, TENANT_ID])
  })
})
