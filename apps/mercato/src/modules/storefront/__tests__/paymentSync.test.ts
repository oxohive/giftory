import { beforeEach, describe, expect, it, jest } from '@jest/globals'

/**
 * Payment confirmation (FEAT-004 req. 7): gateway status events (webhooks,
 * poller, Razorpay confirm route) converge the storefront ledger and the sales
 * order. Duplicate and replayed deliveries must never record a second payment.
 */

type Row = Record<string, unknown>

class MockStorefrontCheckout {}
class MockSalesOrder {}

const executeCommand = jest.fn<(container: unknown, id: string, input: Row, ctx: unknown) => Promise<unknown>>()
const findSalesDictionaryEntryId = jest.fn<(em: unknown, scope: unknown, key: string, value: string) => Promise<string | null>>()
const emitStorefrontEvent = jest.fn<(...args: unknown[]) => Promise<void>>()
const createRequestContainer = jest.fn<() => Promise<unknown>>()

jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: () => createRequestContainer() }))
jest.mock('../data/entities', () => ({ StorefrontCheckout: MockStorefrontCheckout }))
jest.mock('@open-mercato/core/modules/sales/data/entities', () => ({ SalesOrder: MockSalesOrder }))
jest.mock('../events', () => ({ emitStorefrontEvent: (...args: unknown[]) => emitStorefrontEvent(...args) }))
jest.mock('../lib/system', () => ({
  executeCommand: (...args: [unknown, string, Row, unknown]) => executeCommand(...args),
  findSalesDictionaryEntryId: (...args: [unknown, unknown, string, string]) => findSalesDictionaryEntryId(...args),
  systemCommandContext: (_container: unknown, scope: Row) => ({ systemActor: true, selectedOrganizationId: scope.organizationId }),
}))
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findOneWithDecryption: async (em: FakeEm, entity: unknown, where: Row) => em.findOneSync(entity, where),
}))

import { syncCheckoutPayment } from '../lib/paymentSync'
import { handleGatewayPaymentEvent } from '../lib/subscriberSupport'
import * as authorizedSubscriber from '../subscribers/payment-authorized'
import * as cancelledSubscriber from '../subscribers/payment-cancelled'
import * as capturedSubscriber from '../subscribers/payment-captured'
import * as failedSubscriber from '../subscribers/payment-failed'
import * as refundedSubscriber from '../subscribers/payment-refunded'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'
const OTHER_TENANT = '33333333-3333-4333-8333-333333333333'
const ORDER_ID = 'dddddddd-0000-4000-8000-000000000001'
const TXN = 'txn-1'

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => (row[key] ?? null) === expected)
}

class FakeEm {
  checkouts: Row[] = []
  orders: Row[] = []
  flush = jest.fn(async () => undefined)
  fork = () => this

  store(entity: unknown) {
    return entity === MockStorefrontCheckout ? this.checkouts : entity === MockSalesOrder ? this.orders : []
  }

  findOneSync(entity: unknown, where: Row) {
    return this.store(entity).find((row) => matches(row, where)) ?? null
  }

  findOne = jest.fn(async (entity: unknown, where: Row) => this.findOneSync(entity, where))

  nativeUpdate = jest.fn(async (entity: unknown, where: Row, data: Row) => {
    const rows = this.store(entity).filter((row) => matches(row, where))
    for (const row of rows) Object.assign(row, data)
    return rows.length
  })
}

let em: FakeEm
let transaction: Row | null
const gateway = { findTransaction: jest.fn(async (_id: string, _scope: unknown) => transaction) }
const container = {
  resolve: (name: string) => {
    if (name === 'em') return em
    if (name === 'paymentGatewayService') return gateway
    throw new Error(`unexpected ${name}`)
  },
}

function seed(checkout: Row = {}, order: Row = {}) {
  em.checkouts.push({
    id: 'checkout-1',
    tenantId: TENANT,
    organizationId: ORG,
    gatewayTransactionId: TXN,
    orderId: ORDER_ID,
    paymentStatus: 'pending',
    salesPaymentId: null,
    paymentRecordedAt: null,
    ...checkout,
  })
  em.orders.push({
    id: ORDER_ID,
    tenantId: TENANT,
    organizationId: ORG,
    deletedAt: null,
    status: null,
    paymentStatus: 'pending',
    paymentMethodId: 'pm-razorpay',
    ...order,
  })
}

function txn(status: string, overrides: Row = {}): Row {
  return { id: TXN, providerKey: 'razorpay', unifiedStatus: status, amount: '1047.0000', capturedAmount: '0', currencyCode: 'inr', ...overrides }
}

function sync(trigger: Row = {}) {
  return syncCheckoutPayment(container as never, { transactionId: TXN, tenantId: TENANT, organizationId: ORG, ...trigger } as never)
}

function commands(id: string) {
  return executeCommand.mock.calls.filter(([, commandId]) => commandId === id).map(([, , input]) => input)
}

beforeEach(() => {
  em = new FakeEm()
  transaction = null
  gateway.findTransaction.mockClear()
  executeCommand.mockReset()
  executeCommand.mockImplementation(async (_c, id) => (id === 'sales.payments.create' ? { id: 'sales-payment-1' } : {}))
  findSalesDictionaryEntryId.mockReset()
  findSalesDictionaryEntryId.mockImplementation(async (_em, _scope, key, value) => `${key}:${value}`)
  emitStorefrontEvent.mockReset()
  emitStorefrontEvent.mockResolvedValue(undefined)
  createRequestContainer.mockReset()
})

describe('syncCheckoutPayment — scoping and no-ops', () => {
  it('ignores transactions that do not belong to a storefront checkout in this scope', async () => {
    seed({ tenantId: OTHER_TENANT })
    transaction = txn('captured')
    await sync()
    expect(em.findOne).toHaveBeenCalledWith(MockStorefrontCheckout, { gatewayTransactionId: TXN, tenantId: TENANT, organizationId: ORG })
    expect(gateway.findTransaction).not.toHaveBeenCalled()
    expect(executeCommand).not.toHaveBeenCalled()
  })

  it('does nothing for a checkout that never produced an order', async () => {
    seed({ orderId: null })
    transaction = txn('captured')
    await sync()
    expect(executeCommand).not.toHaveBeenCalled()
  })

  it('reads the transaction state from the gateway service with the trigger scope (never the event status)', async () => {
    seed()
    transaction = txn('failed')
    await sync()
    expect(gateway.findTransaction).toHaveBeenCalledWith(TXN, { tenantId: TENANT, organizationId: ORG })
    expect(em.checkouts[0]!.paymentStatus).toBe('failed')
  })

  it('does nothing when the transaction cannot be found', async () => {
    seed()
    transaction = null
    await sync()
    expect(em.checkouts[0]!.paymentStatus).toBe('pending')
    expect(executeCommand).not.toHaveBeenCalled()
  })
})

describe('syncCheckoutPayment — captured payments', () => {
  it('records exactly one sales payment for the captured amount and confirms the order', async () => {
    seed()
    transaction = txn('captured', { capturedAmount: '1047.0000' })
    await sync()

    const [payment] = commands('sales.payments.create')
    expect(payment).toMatchObject({
      tenantId: TENANT,
      organizationId: ORG,
      orderId: ORDER_ID,
      paymentMethodId: 'pm-razorpay',
      paymentReference: `razorpay:${TXN}`,
      amount: 1047,
      capturedAmount: 1047,
      currencyCode: 'INR',
      statusEntryId: 'sales.payment_status:captured',
      metadata: { source: 'storefront', checkoutId: 'checkout-1', gatewayTransactionId: TXN, providerKey: 'razorpay' },
    })
    expect(em.checkouts[0]).toMatchObject({ paymentStatus: 'captured', salesPaymentId: 'sales-payment-1' })
    expect(commands('sales.orders.update')).toEqual([
      { id: ORDER_ID, paymentStatusEntryId: 'sales.payment_status:captured', statusEntryId: 'sales.order_status:confirmed' },
    ])
    expect(emitStorefrontEvent).toHaveBeenCalledWith(
      'storefront.order.payment_synced',
      expect.objectContaining({ orderId: ORDER_ID, transactionId: TXN, paymentStatus: 'captured', tenantId: TENANT, organizationId: ORG }),
    )
  })

  it('falls back to the authorized amount when the captured amount is not reported', async () => {
    seed()
    transaction = txn('captured', { capturedAmount: null, amount: '499.5000' })
    await sync()
    expect(commands('sales.payments.create')[0]).toMatchObject({ amount: 499.5, capturedAmount: 499.5 })
  })

  it('is idempotent across duplicate / replayed webhook deliveries', async () => {
    seed()
    transaction = txn('captured')
    await sync()
    await sync()
    await sync()
    expect(commands('sales.payments.create')).toHaveLength(1)
  })

  it('does not record a payment when a concurrent delivery already claimed it', async () => {
    seed({ paymentRecordedAt: new Date() })
    transaction = txn('captured')
    await sync()
    expect(commands('sales.payments.create')).toHaveLength(0)
  })

  it('releases the claim when recording fails so the retried event can record it', async () => {
    seed()
    transaction = txn('captured')
    executeCommand.mockImplementationOnce(async () => {
      throw new Error('sales down')
    })
    await expect(sync()).rejects.toThrow('sales down')
    expect(em.checkouts[0]).toMatchObject({ paymentRecordedAt: null, salesPaymentId: null })
    await sync()
    expect(commands('sales.payments.create')).toHaveLength(2)
    expect(em.checkouts[0]!.salesPaymentId).toBe('sales-payment-1')
  })

  it('does not overwrite an order status staff already set', async () => {
    seed({}, { status: 'in_production' })
    transaction = txn('captured')
    await sync()
    expect(commands('sales.orders.update')[0]).not.toHaveProperty('statusEntryId')
  })
})

describe('syncCheckoutPayment — non-captured states', () => {
  it('authorized: confirms the order but records no payment (sales would count it as paid)', async () => {
    seed()
    transaction = txn('authorized')
    await sync()
    expect(commands('sales.payments.create')).toHaveLength(0)
    expect(commands('sales.orders.update')).toEqual([
      { id: ORDER_ID, paymentStatusEntryId: 'sales.payment_status:authorized', statusEntryId: 'sales.order_status:confirmed' },
    ])
  })

  it('failed / declined: marks the payment failed, records nothing and leaves the order unconfirmed', async () => {
    seed()
    transaction = txn('failed')
    await sync()
    expect(commands('sales.payments.create')).toHaveLength(0)
    expect(commands('sales.orders.update')).toEqual([{ id: ORDER_ID, paymentStatusEntryId: 'sales.payment_status:failed' }])
  })

  it('cancelled maps to the sales "canceled" spelling', async () => {
    seed()
    transaction = txn('cancelled')
    await sync()
    expect(commands('sales.orders.update')).toEqual([{ id: ORDER_ID, paymentStatusEntryId: 'sales.payment_status:canceled' }])
  })

  it('skips the order update (without failing) when the dictionary entry is missing', async () => {
    seed()
    transaction = txn('failed')
    findSalesDictionaryEntryId.mockResolvedValue(null)
    await sync()
    expect(commands('sales.orders.update')).toHaveLength(0)
    expect(em.checkouts[0]!.paymentStatus).toBe('failed')
  })

  it('does not re-send an unchanged payment status', async () => {
    seed({}, { paymentStatus: 'failed' })
    transaction = txn('failed')
    await sync()
    expect(commands('sales.orders.update')).toHaveLength(0)
  })
})

describe('syncCheckoutPayment — refunds', () => {
  it('marks the recorded payment refunded with the paid amount', async () => {
    seed({ salesPaymentId: 'sales-payment-1', paymentRecordedAt: new Date(), paymentStatus: 'captured' }, { paymentStatus: 'captured', status: 'confirmed' })
    transaction = txn('refunded', { capturedAmount: '1047.0000' })
    await sync()
    expect(commands('sales.payments.create')).toHaveLength(0)
    expect(commands('sales.payments.update')).toEqual([
      { id: 'sales-payment-1', tenantId: TENANT, organizationId: ORG, refundedAmount: 1047, statusEntryId: 'sales.payment_status:refunded' },
    ])
  })

  it('records the payment first when the refund event is the first one we see', async () => {
    seed()
    transaction = txn('refunded', { capturedAmount: '1047.0000' })
    await sync()
    expect(commands('sales.payments.create')).toHaveLength(1)
    expect(commands('sales.payments.update')).toHaveLength(1)
  })
})

describe('gateway payment subscribers', () => {
  it('subscribe persistently to every payment_gateways status event', () => {
    expect(
      [authorizedSubscriber, capturedSubscriber, failedSubscriber, cancelledSubscriber, refundedSubscriber].map((module) => [
        module.metadata.event,
        module.metadata.persistent,
      ]),
    ).toEqual([
      ['payment_gateways.payment.authorized', true],
      ['payment_gateways.payment.captured', true],
      ['payment_gateways.payment.failed', true],
      ['payment_gateways.payment.cancelled', true],
      ['payment_gateways.payment.refunded', true],
    ])
  })

  it('ignore events without a transaction id or scope', async () => {
    await handleGatewayPaymentEvent('payment_gateways.payment.captured', { transactionId: TXN, tenantId: TENANT, organizationId: null })
    await handleGatewayPaymentEvent('payment_gateways.payment.captured', { transactionId: null, tenantId: TENANT, organizationId: ORG })
    await capturedSubscriber.default({ transactionId: TXN, organizationId: ORG })
    expect(createRequestContainer).not.toHaveBeenCalled()
  })

  it('sync with the scope of the event and rethrow failures so the event is retried', async () => {
    createRequestContainer.mockResolvedValue(container)
    seed()
    transaction = txn('captured')
    await capturedSubscriber.default({ transactionId: TXN, tenantId: TENANT, organizationId: ORG })
    expect(commands('sales.payments.create')).toHaveLength(1)

    executeCommand.mockRejectedValue(new Error('boom'))
    em.checkouts[0]!.salesPaymentId = null
    em.checkouts[0]!.paymentRecordedAt = null
    await expect(failedSubscriber.default({ transactionId: TXN, tenantId: TENANT, organizationId: ORG })).rejects.toThrow('boom')
  })
})
