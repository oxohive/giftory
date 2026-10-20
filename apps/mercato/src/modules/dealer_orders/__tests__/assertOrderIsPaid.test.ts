import { describe, expect, it, jest } from '@jest/globals'

jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))

import { assertOrderIsPaid } from '../commands/assignments'

const ORDER_ID = 'eeeeeeee-0000-4000-a000-000000000001'
const TENANT_ID = 'aaaaaaaa-0000-4000-a000-000000000001'

/**
 * Regression test for a genuine, previously undiscovered bug: this query
 * used to reference a table literally named `orders`, which does not exist
 * in this app's schema (Phase 1 checkout writes to `sales_orders` — see
 * `storefront/lib/checkout.ts`'s `createSalesOrder`, which creates a
 * `SalesOrder` entity, table `sales_orders`). Because every prior test
 * mocked `em.getConnection().execute(...)`, the wrong table name was never
 * exercised against a real database, so every admin order assignment would
 * have failed in production with `relation "orders" does not exist`.
 */
describe('assertOrderIsPaid', () => {
  it('queries the real sales_orders table, never the nonexistent "orders" table', async () => {
    const execute = jest.fn(async () => [{ id: ORDER_ID }])
    const em = { getConnection: () => ({ execute }) }

    await assertOrderIsPaid(em as never, ORDER_ID, TENANT_ID)

    expect(execute).toHaveBeenCalledTimes(1)
    const [sql, params] = execute.mock.calls[0]
    expect(sql).toMatch(/FROM sales_orders\b/)
    expect(sql).not.toMatch(/FROM orders\b/)
    expect(params).toEqual([ORDER_ID, TENANT_ID])
  })

  it('throws (surfaced as "order not paid") when the query returns no row', async () => {
    const execute = jest.fn(async () => [])
    const em = { getConnection: () => ({ execute }) }
    await expect(assertOrderIsPaid(em as never, ORDER_ID, TENANT_ID)).rejects.toThrow(
      'Order must be in paid status before it can be assigned',
    )
  })
})
