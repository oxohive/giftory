import { describe, expect, it } from '@jest/globals'
import { cartLineKey, normalizeGiftMessage, validateGiftOptions } from '../lib/giftOptions'
import { decideIdempotency, hashRequest, normalizeIdempotencyKey, stableStringify, substituteOrderId } from '../lib/idempotency'
import { isAllowedReturnUrl } from '../lib/returnUrls'
import { generateToken, hashToken, parseOrderAccess, serializeOrderAccess, tokenMatchesHash } from '../lib/tokens'
import { placeOrderSchema } from '../data/validators'
import { CHECKOUT_CLAIM_STALE_MS } from '../lib/constants'

const ORDER_ID = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b'

describe('gift options', () => {
  const profile = { giftWrapAvailable: true, giftMessageMaxLength: 10 }

  it('accepts a message within the gift profile limit', () => {
    expect(validateGiftOptions({ giftWrap: true, giftMessage: '  Happy 30! ' }, profile)).toEqual({
      ok: true,
      giftWrap: true,
      giftMessage: 'Happy 30!',
    })
  })

  it('rejects messages longer than giftMessageMaxLength (counting characters, not UTF-16 units)', () => {
    expect(validateGiftOptions({ giftMessage: 'x'.repeat(11) }, profile)).toMatchObject({ ok: false, code: 'gift_message_too_long', maxLength: 10 })
    expect(validateGiftOptions({ giftMessage: '🎁'.repeat(10) }, profile).ok).toBe(true)
  })

  it('rejects gift wrap when the product does not offer it, and messages when the limit is 0', () => {
    expect(validateGiftOptions({ giftWrap: true }, { giftWrapAvailable: false, giftMessageMaxLength: 100 })).toMatchObject({
      ok: false,
      code: 'gift_wrap_unavailable',
    })
    expect(validateGiftOptions({ giftMessage: 'hi' }, { giftWrapAvailable: true, giftMessageMaxLength: 0 })).toMatchObject({
      ok: false,
      code: 'gift_message_not_allowed',
    })
  })

  it('falls back to gift_catalog defaults without a profile (no wrap, 250 chars)', () => {
    expect(validateGiftOptions({ giftWrap: true }, null).ok).toBe(false)
    expect(validateGiftOptions({ giftMessage: 'x'.repeat(250) }, null).ok).toBe(true)
    expect(validateGiftOptions({ giftMessage: 'x'.repeat(251) }, null).ok).toBe(false)
  })

  it('treats blank messages as none and keys lines by product, variant and gift options', () => {
    expect(normalizeGiftMessage('   ')).toBeNull()
    expect(normalizeGiftMessage('a\r\nb')).toBe('a\nb')
    const base = cartLineKey(ORDER_ID, null, false, null)
    expect(cartLineKey(ORDER_ID, null, false, null)).toBe(base)
    expect(cartLineKey(ORDER_ID, null, true, null)).not.toBe(base)
    expect(cartLineKey(ORDER_ID, null, false, 'love')).not.toBe(base)
  })
})

describe('idempotency', () => {
  it('normalizes keys and rejects short or unsafe ones', () => {
    expect(normalizeIdempotencyKey('  order-1234567890abcdef ')).toBe('order-1234567890abcdef')
    expect(normalizeIdempotencyKey('short')).toBeNull()
    expect(normalizeIdempotencyKey('order 1234567890 abcdef')).toBeNull()
    expect(normalizeIdempotencyKey('x'.repeat(129))).toBeNull()
    expect(normalizeIdempotencyKey(null)).toBeNull()
  })

  it('hashes requests independently of key order', () => {
    expect(stableStringify({ b: 1, a: { d: [1, 2], c: null } })).toBe('{"a":{"c":null,"d":[1,2]},"b":1}')
    expect(hashRequest({ a: 1, b: 2 })).toBe(hashRequest({ b: 2, a: 1 }))
    expect(hashRequest({ a: 1 })).not.toBe(hashRequest({ a: 2 }))
  })

  const now = new Date('2026-10-05T10:00:00Z')
  const fresh = new Date(now.getTime() - 1000)
  const stale = new Date(now.getTime() - CHECKOUT_CLAIM_STALE_MS - 1)

  it('replays the same request and rejects a different body under the same key', () => {
    expect(decideIdempotency({ requestHash: 'h1', status: 'completed', claimedAt: fresh, orderId: ORDER_ID }, 'h1', now)).toBe('resume')
    expect(decideIdempotency({ requestHash: 'h1', status: 'order_created', claimedAt: fresh, orderId: ORDER_ID }, 'h1', now)).toBe('resume')
    expect(decideIdempotency({ requestHash: 'h1', status: 'completed', claimedAt: fresh, orderId: ORDER_ID }, 'h2', now)).toBe('mismatch')
  })

  it('blocks concurrent duplicates and lets a stalled attempt without an order be reclaimed', () => {
    expect(decideIdempotency({ requestHash: 'h1', status: 'processing', claimedAt: fresh, orderId: null }, 'h1', now)).toBe('in_progress')
    expect(decideIdempotency({ requestHash: 'h1', status: 'processing', claimedAt: fresh, orderId: null }, 'h2', now)).toBe('in_progress')
    expect(decideIdempotency({ requestHash: 'h1', status: 'processing', claimedAt: stale, orderId: null }, 'h1', now)).toBe('reclaim')
    // No order was created, so a corrected body may take the key over.
    expect(decideIdempotency({ requestHash: 'h1', status: 'processing', claimedAt: stale, orderId: null }, 'h2', now)).toBe('reclaim')
    expect(decideIdempotency({ requestHash: 'h1', status: 'processing', claimedAt: fresh, orderId: ORDER_ID }, 'h1', now)).toBe('resume')
    expect(decideIdempotency({ requestHash: 'h1', status: 'processing', claimedAt: fresh, orderId: ORDER_ID }, 'h2', now)).toBe('mismatch')
  })

  it('substitutes the {orderId} placeholder', () => {
    expect(substituteOrderId('https://shop.test/order/{orderId}/confirmation?provider=stripe', ORDER_ID)).toBe(
      `https://shop.test/order/${ORDER_ID}/confirmation?provider=stripe`,
    )
  })
})

describe('payment return URLs', () => {
  it('allows configured storefront origins only', () => {
    const env = { NODE_ENV: 'production', STOREFRONT_ALLOWED_RETURN_ORIGINS: 'https://giftory.in, https://www.giftory.in' }
    expect(isAllowedReturnUrl('https://giftory.in/order/{orderId}/confirmation', env)).toBe(true)
    expect(isAllowedReturnUrl('https://evil.test/order/{orderId}', env)).toBe(false)
    expect(isAllowedReturnUrl('javascript:alert(1)', env)).toBe(false)
    expect(isAllowedReturnUrl('https://user:pass@giftory.in/x', env)).toBe(false)
  })

  it('fails closed in production without configuration, allows loopback in development', () => {
    expect(isAllowedReturnUrl('http://localhost:3001/checkout', { NODE_ENV: 'production' })).toBe(false)
    expect(isAllowedReturnUrl('http://localhost:3001/checkout', { NODE_ENV: 'development' })).toBe(true)
    expect(isAllowedReturnUrl('https://shop.test/checkout', { NODE_ENV: 'development' })).toBe(false)
  })
})

describe('opaque tokens', () => {
  it('stores only hashes and compares in constant time', () => {
    const token = generateToken()
    const hash = hashToken(token)
    expect(hash).not.toContain(token)
    expect(tokenMatchesHash(token, hash)).toBe(true)
    expect(tokenMatchesHash(generateToken(), hash)).toBe(false)
    expect(tokenMatchesHash(token, null)).toBe(false)
  })

  it('round-trips guest order access entries, newest first and de-duplicated', () => {
    const t1 = generateToken()
    const t2 = generateToken()
    const other = '11111111-1111-4111-8111-111111111111'
    const cookie = serializeOrderAccess(parseOrderAccess(serializeOrderAccess([], { orderId: ORDER_ID, token: t1 })), { orderId: other, token: t2 })
    expect(parseOrderAccess(cookie)).toEqual([
      { orderId: other, token: t2 },
      { orderId: ORDER_ID, token: t1 },
    ])
    expect(parseOrderAccess('garbage|also.bad')).toEqual([])
  })
})

describe('order placement payload', () => {
  const valid = {
    email: 'Asha@Example.com',
    lines: [{ productId: ORDER_ID, variantId: null, quantity: 1, giftWrap: true, giftMessage: 'Hi' }],
    shippingAddress: {
      fullName: 'Asha Rao',
      phone: '9876543210',
      line1: '12 MG Road',
      line2: '',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
      country: 'IN',
    },
    billingSameAsShipping: true,
    billingAddress: null,
    shippingMethodCode: 'standard',
    paymentProvider: 'razorpay',
    successUrl: 'http://localhost:3001/order/{orderId}/confirmation',
    cancelUrl: 'http://localhost:3001/checkout',
  }

  it('accepts the storefront body and never carries client prices or scope', () => {
    const parsed = placeOrderSchema.parse({
      ...valid,
      tenantId: ORDER_ID,
      organizationId: ORDER_ID,
      lines: [{ ...valid.lines[0], unitPriceMinor: 1 }],
    }) as Record<string, unknown>
    expect(parsed.email).toBe('asha@example.com')
    expect(parsed.currencyCode).toBe('INR')
    expect(parsed.tenantId).toBeUndefined()
    expect(parsed.organizationId).toBeUndefined()
    expect((parsed.lines as Array<Record<string, unknown>>)[0]!.unitPriceMinor).toBeUndefined()
  })

  it('rejects other currencies and unknown payment providers', () => {
    expect(placeOrderSchema.safeParse({ ...valid, currencyCode: 'USD' }).success).toBe(false)
    expect(placeOrderSchema.safeParse({ ...valid, paymentProvider: 'paypal' }).success).toBe(false)
  })
})
