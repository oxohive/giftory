import { describe, expect, it, jest } from '@jest/globals'
import { createRazorpayClient, RAZORPAY_API_BASE_URL, RazorpayApiError } from '../lib/client'
import { resolveRazorpayCredentials } from '../lib/credentials'

/**
 * Razorpay HTTP client failure paths not covered by adapter.test.ts: network
 * errors and timeouts, rate limiting, malformed responses, path injection and
 * the fixed provider origin. No real network calls are made.
 */

const credentials = resolveRazorpayCredentials({ keyId: 'rzp_test_CLIENT1', keySecret: 'client_secret_value' }, {} as NodeJS.ProcessEnv)
const noSleep = async () => undefined

type Reply = { status: number; body: string } | Error

function fakeFetch(replies: Reply[]) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  const fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const next = replies.shift()
    if (!next) throw new Error('no more replies')
    if (next instanceof Error) throw next
    return new Response(next.body, { status: next.status })
  })
  return { fetch, calls }
}

const order = JSON.stringify({ id: 'order_1', entity: 'order', amount: 100, amount_paid: 0, amount_due: 100, currency: 'INR', status: 'created' })

describe('createRazorpayClient', () => {
  it('refuses to build without API credentials', () => {
    expect(() => createRazorpayClient(resolveRazorpayCredentials({}, {} as NodeJS.ProcessEnv))).toThrow('Key ID and Key Secret are required')
  })

  it('talks only to the fixed Razorpay origin with Basic auth and redirects disabled', async () => {
    const { fetch, calls } = fakeFetch([{ status: 200, body: order }])
    await createRazorpayClient(credentials, { fetch, sleep: noSleep }).fetchOrder('order_1')
    expect(calls[0]!.url).toBe(`${RAZORPAY_API_BASE_URL}/orders/order_1`)
    expect(RAZORPAY_API_BASE_URL).toBe('https://api.razorpay.com/v1')
    const headers = calls[0]!.init!.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('rzp_test_CLIENT1:client_secret_value').toString('base64')}`)
    expect(calls[0]!.init!.redirect).toBe('error')
    expect(calls[0]!.init!.signal).toBeDefined()
  })

  it('URL-encodes ids so a crafted id cannot change the request path', async () => {
    const { fetch, calls } = fakeFetch([{ status: 200, body: order }, { status: 200, body: '{}' }])
    const client = createRazorpayClient(credentials, { fetch, sleep: noSleep })
    await client.fetchOrder('../payments/pay_1/refund?x=1')
    await client.capturePayment('pay_1/../../orders', 100, 'INR')
    expect(calls[0]!.url).toBe(`${RAZORPAY_API_BASE_URL}/orders/..%2Fpayments%2Fpay_1%2Frefund%3Fx%3D1`)
    expect(calls[1]!.url).toBe(`${RAZORPAY_API_BASE_URL}/payments/pay_1%2F..%2F..%2Forders/capture`)
  })

  it('retries GETs after network errors and rate limiting, up to 3 attempts', async () => {
    const { fetch } = fakeFetch([new TypeError('fetch failed'), { status: 429, body: '{}' }, { status: 200, body: order }])
    await expect(createRazorpayClient(credentials, { fetch, sleep: noSleep }).fetchOrder('order_1')).resolves.toMatchObject({ id: 'order_1' })
    expect(fetch).toHaveBeenCalledTimes(3)

    const failing = fakeFetch([{ status: 503, body: '{}' }, { status: 503, body: '{}' }, { status: 503, body: '{}' }, { status: 200, body: order }])
    await expect(createRazorpayClient(credentials, { fetch: failing.fetch, sleep: noSleep }).fetchOrder('order_1')).rejects.toMatchObject({
      status: 503,
      retryable: true,
    })
    expect(failing.fetch).toHaveBeenCalledTimes(3)
  })

  it('reports timeouts distinctly and never retries a POST after a network failure (no double charge)', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    const { fetch } = fakeFetch([timeout])
    const error = await createRazorpayClient(credentials, { fetch, sleep: noSleep })
      .createOrder({ amount: 100, currency: 'INR' })
      .catch((err: unknown) => err)
    expect(error).toBeInstanceOf(RazorpayApiError)
    expect(error).toMatchObject({ code: 'TIMEOUT', status: 0, retryable: true })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not retry 4xx client errors', async () => {
    const { fetch } = fakeFetch([{ status: 401, body: JSON.stringify({ error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' } }) }])
    await expect(createRazorpayClient(credentials, { fetch, sleep: noSleep }).fetchPayment('pay_1')).rejects.toMatchObject({
      status: 401,
      code: 'BAD_REQUEST_ERROR',
      retryable: false,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('flags malformed success bodies instead of returning garbage', async () => {
    const { fetch } = fakeFetch([{ status: 200, body: '<html>gateway</html>' }])
    await expect(createRazorpayClient(credentials, { fetch, sleep: noSleep }).fetchOrder('order_1')).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
      retryable: false,
    })
  })

  it('never puts the key secret into error messages', async () => {
    const { fetch } = fakeFetch([{ status: 400, body: 'not json at all' }])
    const error = (await createRazorpayClient(credentials, { fetch, sleep: noSleep })
      .refundPayment('pay_1', { amount: 100 })
      .catch((err: unknown) => err)) as Error
    expect(error.message).not.toContain('client_secret_value')
    expect(JSON.stringify(error)).not.toContain('client_secret_value')
  })

  it('clamps the health-check page size', async () => {
    const { fetch, calls } = fakeFetch([{ status: 200, body: '{"items":[]}' }, { status: 200, body: '{"items":[]}' }])
    const client = createRazorpayClient(credentials, { fetch, sleep: noSleep })
    await client.listOrders(0)
    await client.listOrders(5000)
    expect(calls.map((call) => call.url.split('?')[1])).toEqual(['count=1', 'count=100'])
  })
})
