import { describe, expect, it } from '@jest/globals'
import {
  deriveRazorpayOrderStatus,
  mapRazorpayOrderStatus,
  mapRazorpayPaymentStatus,
  mapRazorpayRefundStatus,
  mapRazorpayWebhookEvent,
  RAZORPAY_WEBHOOK_EVENTS,
} from '../lib/status-map'
import { razorpayAdapter } from '../lib/adapter'

describe('gateway_razorpay status mapping', () => {
  it('maps Razorpay payment statuses to unified statuses', () => {
    expect(mapRazorpayPaymentStatus('created')).toBe('pending')
    expect(mapRazorpayPaymentStatus('authorized')).toBe('authorized')
    expect(mapRazorpayPaymentStatus('captured')).toBe('captured')
    expect(mapRazorpayPaymentStatus('refunded')).toBe('refunded')
    expect(mapRazorpayPaymentStatus('failed')).toBe('failed')
    expect(mapRazorpayPaymentStatus('weird')).toBe('unknown')
    expect(mapRazorpayPaymentStatus(undefined)).toBe('unknown')
  })

  it('maps Razorpay order statuses to unified statuses', () => {
    expect(mapRazorpayOrderStatus('created')).toBe('pending')
    expect(mapRazorpayOrderStatus('attempted')).toBe('pending')
    expect(mapRazorpayOrderStatus('paid')).toBe('captured')
    expect(mapRazorpayOrderStatus('nope')).toBe('unknown')
  })

  it('maps every subscribed webhook event', () => {
    expect(mapRazorpayWebhookEvent('payment.authorized')).toBe('authorized')
    expect(mapRazorpayWebhookEvent('payment.captured')).toBe('captured')
    expect(mapRazorpayWebhookEvent('order.paid')).toBe('captured')
    // A failed attempt keeps the order payable (Checkout allows retries on the same order).
    expect(mapRazorpayWebhookEvent('payment.failed')).toBe('pending')
    expect(mapRazorpayWebhookEvent('refund.processed', 'full')).toBe('refunded')
    expect(mapRazorpayWebhookEvent('refund.processed', 'partial')).toBe('partially_refunded')
    expect(mapRazorpayWebhookEvent('payment.dispute.created')).toBeUndefined()
    for (const event of RAZORPAY_WEBHOOK_EVENTS) {
      expect(mapRazorpayWebhookEvent(event, 'full')).toBeDefined()
    }
  })

  it('maps refund entity statuses', () => {
    expect(mapRazorpayRefundStatus('processed', false)).toBe('refunded')
    expect(mapRazorpayRefundStatus('processed', true)).toBe('partially_refunded')
    expect(mapRazorpayRefundStatus('pending', true)).toBe('pending')
    expect(mapRazorpayRefundStatus('failed', false)).toBe('failed')
  })

  it('adapter.mapStatus prefers the event type, then payment, then order status', () => {
    expect(razorpayAdapter.mapStatus('failed', 'payment.failed')).toBe('pending')
    expect(razorpayAdapter.mapStatus('captured', 'payment.captured')).toBe('captured')
    expect(razorpayAdapter.mapStatus('partial', 'refund.processed')).toBe('partially_refunded')
    expect(razorpayAdapter.mapStatus('authorized')).toBe('authorized')
    expect(razorpayAdapter.mapStatus('paid')).toBe('captured')
    expect(razorpayAdapter.mapStatus('captured', 'payment.dispute.created')).toBe('captured')
    expect(razorpayAdapter.mapStatus('???')).toBe('unknown')
  })
})

describe('deriveRazorpayOrderStatus', () => {
  const base = { amount: 10000, amount_refunded: 0 }

  it('stays pending while only failed attempts exist', () => {
    const result = deriveRazorpayOrderStatus('attempted', [{ id: 'pay_1', status: 'failed', ...base }])
    expect(result.status).toBe('pending')
    expect(result.payment).toBeNull()
  })

  it('prefers a captured payment over earlier failed attempts', () => {
    const result = deriveRazorpayOrderStatus('paid', [
      { id: 'pay_1', status: 'failed', ...base },
      { id: 'pay_2', status: 'captured', ...base },
    ])
    expect(result).toEqual({ status: 'captured', payment: expect.objectContaining({ id: 'pay_2' }) })
  })

  it('reports authorized, partial refund, and full refund', () => {
    expect(deriveRazorpayOrderStatus('attempted', [{ id: 'p', status: 'authorized', ...base }]).status).toBe('authorized')
    expect(deriveRazorpayOrderStatus('paid', [{ id: 'p', status: 'captured', amount: 10000, amount_refunded: 2500 }]).status)
      .toBe('partially_refunded')
    expect(deriveRazorpayOrderStatus('paid', [{ id: 'p', status: 'refunded', amount: 10000, amount_refunded: 10000 }]).status)
      .toBe('refunded')
  })

  it('falls back to the order status when there are no payments', () => {
    expect(deriveRazorpayOrderStatus('created', []).status).toBe('pending')
    expect(deriveRazorpayOrderStatus('paid', []).status).toBe('captured')
    expect(deriveRazorpayOrderStatus('mystery', []).status).toBe('pending')
  })
})
