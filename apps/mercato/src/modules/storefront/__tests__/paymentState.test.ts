import { describe, expect, it } from '@jest/globals'
import { desiredSalesPaymentStatus, orderAmountDue, orderTotals, paidAmountOf, shopperPaymentStatus } from '../lib/paymentState'

describe('order totals from the native sales order', () => {
  it('splits shipping out of the sales gross subtotal', () => {
    expect(
      orderTotals({ subtotalGrossAmount: '1078.0000', shippingGrossAmount: '79.0000', taxTotalAmount: '152.39', grandTotalGrossAmount: '1078.0000' }),
    ).toEqual({ subtotal: 999, shipping: 79, tax: 152.39, grandTotal: 1078 })
  })

  it('charges the outstanding amount, mirroring the sales payment reconciliation', () => {
    expect(orderAmountDue({ outstandingAmount: '0', paidTotalAmount: '0', refundedTotalAmount: '0', grandTotalGrossAmount: '1078' })).toBe(1078)
    expect(orderAmountDue({ outstandingAmount: '78', paidTotalAmount: '1000', refundedTotalAmount: '0', grandTotalGrossAmount: '1078' })).toBe(78)
    expect(orderAmountDue({ outstandingAmount: '0', paidTotalAmount: '1078', refundedTotalAmount: '0', grandTotalGrossAmount: '1078' })).toBe(0)
  })
})

describe('payment status follows the gateway transaction', () => {
  it('maps unified gateway statuses to sales payment status values', () => {
    expect(desiredSalesPaymentStatus('pending')).toBe('pending')
    expect(desiredSalesPaymentStatus('authorized')).toBe('authorized')
    expect(desiredSalesPaymentStatus('captured')).toBe('captured')
    expect(desiredSalesPaymentStatus('failed')).toBe('failed')
    expect(desiredSalesPaymentStatus('cancelled')).toBe('canceled')
    expect(desiredSalesPaymentStatus('expired')).toBe('canceled')
    expect(desiredSalesPaymentStatus('refunded')).toBe('refunded')
    expect(desiredSalesPaymentStatus('unknown')).toBeNull()
  })

  it('records the captured amount, else the authorized amount', () => {
    expect(paidAmountOf({ amount: '1078.0000', capturedAmount: '0' })).toBe(1078)
    expect(paidAmountOf({ amount: '1078.0000', capturedAmount: '500.5' })).toBe(500.5)
  })

  it('shows shoppers a paid attempt over a later abandoned retry', () => {
    const order = { paymentStatus: 'pending' }
    expect(
      shopperPaymentStatus(order, [
        { paymentStatus: 'pending', gatewayTransactionId: 'retry' },
        { paymentStatus: 'captured', gatewayTransactionId: 'first' },
      ]),
    ).toBe('captured')
    expect(shopperPaymentStatus(order, [{ paymentStatus: 'failed', gatewayTransactionId: 't' }])).toBe('failed')
    expect(shopperPaymentStatus(order, [])).toBe('pending')
  })
})
