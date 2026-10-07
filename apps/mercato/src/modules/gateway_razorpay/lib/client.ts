import type { RazorpayCredentials } from './credentials'
import { requireRazorpayApiCredentials } from './credentials'

/** Fixed provider origin. It is never configurable, so there is no SSRF surface here. */
export const RAZORPAY_API_BASE_URL = 'https://api.razorpay.com/v1'

const DEFAULT_TIMEOUT_MS = 10_000
const MAX_GET_RETRIES = 2
const MAX_RESPONSE_BYTES = 1_000_000

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type RazorpayClientOptions = {
  fetch?: FetchLike
  timeoutMs?: number
  /** Sleep hook for retries; injectable so tests do not wait. */
  sleep?: (ms: number) => Promise<void>
}

/** Provider error with only non-sensitive fields (status, Razorpay error code/description). */
export class RazorpayApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly retryable: boolean

  constructor(message: string, status: number, code: string | null, retryable: boolean) {
    super(message)
    this.name = 'RazorpayApiError'
    this.status = status
    this.code = code
    this.retryable = retryable
  }
}

// ── Entities (subset of fields we rely on) ──────────────────────────────────

export type RazorpayOrder = {
  id: string
  entity: 'order'
  amount: number
  amount_paid: number
  amount_due: number
  currency: string
  receipt: string | null
  status: 'created' | 'attempted' | 'paid' | string
  attempts?: number
  notes?: Record<string, string> | unknown[]
  created_at?: number
}

export type RazorpayPayment = {
  id: string
  entity: 'payment'
  amount: number
  currency: string
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed' | string
  order_id: string | null
  method?: string | null
  captured?: boolean
  amount_refunded?: number | null
  refund_status?: 'partial' | 'full' | null | string
  error_code?: string | null
  error_description?: string | null
  error_reason?: string | null
  created_at?: number
}

export type RazorpayRefund = {
  id: string
  entity: 'refund'
  amount: number
  currency: string
  payment_id: string
  status: 'pending' | 'processed' | 'failed' | string
  speed_processed?: string | null
  receipt?: string | null
  created_at?: number
}

type RazorpayCollection<T> = { entity: 'collection'; count: number; items: T[] }

export type CreateRazorpayOrderInput = {
  amount: number
  currency: string
  receipt?: string
  notes?: Record<string, string>
  /** Legacy order-level capture flag; 1 = auto capture on authorization. */
  payment_capture?: 0 | 1
}

export type CreateRazorpayRefundInput = {
  amount?: number
  speed?: 'normal' | 'optimum'
  receipt?: string
  notes?: Record<string, string>
}

// ── Client ──────────────────────────────────────────────────────────────────

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function backoffMs(attempt: number): number {
  const base = 250 * 2 ** attempt
  return base + Math.floor(Math.random() * base)
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

async function readBoundedText(response: Response): Promise<string> {
  const text = await response.text()
  return text.length > MAX_RESPONSE_BYTES ? text.slice(0, MAX_RESPONSE_BYTES) : text
}

function parseErrorBody(text: string): { code: string | null; description: string | null } {
  try {
    const parsed = JSON.parse(text) as { error?: { code?: unknown; description?: unknown } }
    const code = typeof parsed?.error?.code === 'string' ? parsed.error.code : null
    const description = typeof parsed?.error?.description === 'string' ? parsed.error.description : null
    return { code, description }
  } catch {
    return { code: null, description: null }
  }
}

export type RazorpayClient = ReturnType<typeof createRazorpayClient>

export function createRazorpayClient(credentials: RazorpayCredentials, options: RazorpayClientOptions = {}) {
  const { keyId, keySecret } = requireRazorpayApiCredentials(credentials)
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => fetch(input, init))
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const sleep = options.sleep ?? defaultSleep
  const authorization = `Basic ${Buffer.from(`${keyId}:${keySecret}`, 'utf8').toString('base64')}`

  async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    // Only reads are retried; POSTs (orders, captures, refunds) are not safely repeatable.
    const maxAttempts = method === 'GET' ? MAX_GET_RETRIES + 1 : 1
    let lastError: unknown = null

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) await sleep(backoffMs(attempt - 1))
      let response: Response
      try {
        response = await fetchImpl(`${RAZORPAY_API_BASE_URL}${path}`, {
          method,
          headers: {
            Authorization: authorization,
            Accept: 'application/json',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
          redirect: 'error',
        })
      } catch (error) {
        const isTimeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
        lastError = new RazorpayApiError(
          isTimeout ? `Razorpay request timed out (${method} ${path})` : `Razorpay request failed (${method} ${path})`,
          0,
          isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
          true,
        )
        continue
      }

      const text = await readBoundedText(response)
      if (response.ok) {
        try {
          return JSON.parse(text) as T
        } catch {
          throw new RazorpayApiError(`Razorpay returned a malformed response (${method} ${path})`, response.status, 'MALFORMED_RESPONSE', false)
        }
      }

      const { code, description } = parseErrorBody(text)
      const retryable = isRetryableStatus(response.status)
      lastError = new RazorpayApiError(
        `Razorpay API error ${response.status}${code ? ` ${code}` : ''}: ${description ?? 'request failed'}`,
        response.status,
        code,
        retryable,
      )
      if (!retryable) break
    }

    throw lastError ?? new RazorpayApiError('Razorpay request failed', 0, null, false)
  }

  const encode = encodeURIComponent

  return {
    createOrder: (input: CreateRazorpayOrderInput) => request<RazorpayOrder>('POST', '/orders', input),
    fetchOrder: (orderId: string) => request<RazorpayOrder>('GET', `/orders/${encode(orderId)}`),
    fetchOrderPayments: async (orderId: string) =>
      (await request<RazorpayCollection<RazorpayPayment>>('GET', `/orders/${encode(orderId)}/payments`)).items ?? [],
    fetchPayment: (paymentId: string) => request<RazorpayPayment>('GET', `/payments/${encode(paymentId)}`),
    capturePayment: (paymentId: string, amount: number, currency: string) =>
      request<RazorpayPayment>('POST', `/payments/${encode(paymentId)}/capture`, { amount, currency }),
    refundPayment: (paymentId: string, input: CreateRazorpayRefundInput) =>
      request<RazorpayRefund>('POST', `/payments/${encode(paymentId)}/refund`, input),
    /** Cheap authenticated read used by the health check. */
    listOrders: (count = 1) => request<RazorpayCollection<RazorpayOrder>>('GET', `/orders?count=${Math.max(1, Math.min(count, 100))}`),
  }
}
