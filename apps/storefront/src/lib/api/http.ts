import { z } from 'zod'
import { BFF_PREFIX } from '@/lib/env.public'

/** Error raised for non-2xx responses, network failures and schema mismatches. */
export class ApiError extends Error {
  readonly status: number
  readonly code: 'http' | 'network' | 'schema' | 'not_implemented'
  readonly details: unknown

  constructor(message: string, options: { status?: number; code?: ApiError['code']; details?: unknown } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status ?? 0
    this.code = options.code ?? 'http'
    this.details = options.details
  }

  get isUnauthorized() {
    return this.status === 401
  }

  /** True when the backend does not (yet) expose the endpoint — used by TODO adapters. */
  get isMissingEndpoint() {
    return this.code === 'not_implemented' || this.status === 404 || this.status === 405 || this.status === 501
  }
}

/** Open Mercato uses `{ ok: false, error }` (customer_accounts) or `{ error }` (CRUD routes). */
const errorEnvelope = z
  .object({
    error: z.unknown().optional(),
    message: z.string().optional(),
    details: z.unknown().optional(),
  })
  .passthrough()

export function messageFromBody(body: unknown, fallback: string): string {
  const parsed = errorEnvelope.safeParse(body)
  if (!parsed.success) return fallback
  const { error, message } = parsed.data
  if (typeof error === 'string' && error.trim()) return error
  if (message) return message
  return fallback
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

export async function parseResponse<T>(res: Response, schema: z.ZodType<T>, label: string): Promise<T> {
  const body = await readBody(res)
  if (!res.ok) {
    throw new ApiError(messageFromBody(body, `${label} failed (${res.status})`), { status: res.status, details: body })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(`${label}: unexpected response shape`, {
      status: res.status,
      code: 'schema',
      details: parsed.error.issues,
    })
  }
  return parsed.data
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | null | undefined>
  headers?: Record<string, string>
  signal?: AbortSignal
}

export function buildQuery(query: RequestOptions['query']): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/**
 * Browser-side request to Open Mercato through the storefront BFF proxy (`/api/om/*`).
 * Going through the proxy keeps the customer's JWT in an httpOnly cookie on the storefront
 * origin and avoids CORS (Open Mercato ships no CORS support).
 */
export async function bffRequest<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const url = `${BFF_PREFIX}/${path.replace(/^\/+/, '')}${buildQuery(options.query)}`
  let res: Response
  try {
    res = await fetch(url, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    })
  } catch (error) {
    throw new ApiError('Network error — please check your connection and try again.', { code: 'network', details: error })
  }
  return parseResponse(res, schema, path)
}

/** Generates an idempotency key for POSTs that create money/orders (architecture §5.4). */
export function newIdempotencyKey(prefix = 'sf'): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${random}`
}
