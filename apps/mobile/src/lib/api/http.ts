/**
 * Low-level typed fetch wrapper that every domain API module (TASK-04) sits
 * on top of.
 *
 * COOKIE HANDLING — READ BEFORE "FIXING":
 * The backend authenticates guest carts/orders/customers purely via httpOnly
 * cookies (`sf_cart_token`, `sf_order_access`, `customer_auth_token`) — there
 * is no `Authorization: Bearer` support anywhere in the storefront API
 * (confirmed by grepping apps/mercato's storefront/customer_accounts
 * modules). A browser's `fetch` is sandboxed per-tab/per-JS-context, which is
 * why a web SPA sometimes needs a manual cookie jar. React Native's `fetch`
 * is NOT that — it runs on the native HTTP stack (OkHttp on Android,
 * NSURLSession on iOS), which transparently persists Set-Cookie responses
 * and resends them for matching-origin requests, exactly like a normal
 * browser's network layer. So: do NOT build a cookie-jar shim here. Plain
 * global `fetch` is correct and sufficient — resist the urge to add manual
 * Cookie-header parsing/forwarding "to be safe"; it isn't needed and will
 * fight with the native layer instead of helping it.
 */
import type { ZodType } from 'zod'
import { env } from './env'
import { ApiError } from './errors'

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  idempotencyKey?: string
}

/**
 * Backend error envelope shapes (confirmed against apps/mercato's storefront
 * and customer_accounts modules):
 *  - CRUD-style endpoints:        { error: string, code: string, details?: unknown }
 *  - customer_accounts-style:     { ok: false, error: string, code?: string }
 *  - bare framework errors:       { error: string }                (e.g. 404 "Not Found")
 *  - bare domain errors:          { code: string, ... }             (e.g. { code: 'order_not_found' })
 */
function normalizeErrorResponse(payload: unknown, status: number): ApiError {
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>

    if (typeof obj.error === 'string' && typeof obj.code === 'string') {
      return new ApiError(obj.error, { code: obj.code, status, details: obj.details })
    }
    if (obj.ok === false && typeof obj.error === 'string') {
      return new ApiError(obj.error, {
        code: typeof obj.code === 'string' ? obj.code : 'unknown_error',
        status,
        details: obj.details,
      })
    }
    if (typeof obj.error === 'string') {
      return new ApiError(obj.error, { code: 'unknown_error', status, details: obj.details })
    }
    if (typeof obj.code === 'string') {
      return new ApiError(`Request failed with code ${obj.code}`, {
        code: obj.code,
        status,
        details: obj,
      })
    }
  }
  return new ApiError(`Request failed with status ${status}`, {
    code: 'unknown_error',
    status,
    details: payload,
  })
}

/**
 * Performs the request against `${env.apiBaseUrl}${path}`, injects
 * organizationId/orgSlug into the query string (every request, regardless of
 * whether `options.query` was passed — the backend has no custom domain to
 * resolve scope from, so this is the only scoping mechanism available),
 * JSON-encodes `body`, sets `Idempotency-Key` when `idempotencyKey` is
 * provided, parses the JSON response, and validates it against `schema`
 * (zod) before returning. Throws `ApiError` on a non-2xx response or a schema
 * mismatch.
 */
export async function apiRequest<T>(
  path: string,
  schema: ZodType<T>,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { method = 'GET', query, body, idempotencyKey } = options

  const url = new URL(path, env.apiBaseUrl)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue
      url.searchParams.set(key, String(value))
    }
  }
  // Tenant/org scope: appended last so it's never accidentally dropped, and
  // never overridden by a caller-supplied query value with the same key.
  if (env.organizationId) {
    url.searchParams.set('organizationId', env.organizationId)
  }
  if (env.orgSlug) {
    url.searchParams.set('orgSlug', env.orgSlug)
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  let requestBody: string | undefined
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    requestBody = JSON.stringify(body)
  }
  // Only ever set when explicitly passed, and never on a GET — the backend
  // only requires/accepts this header on the POST endpoints that create
  // orders/payment sessions.
  if (idempotencyKey && method !== 'GET') {
    headers['Idempotency-Key'] = idempotencyKey
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: requestBody,
  })

  const rawText = await response.text()
  let payload: unknown
  if (rawText.length > 0) {
    try {
      payload = JSON.parse(rawText)
    } catch {
      payload = undefined
    }
  }

  if (!response.ok) {
    throw normalizeErrorResponse(payload, response.status)
  }

  const result = schema.safeParse(payload)
  if (!result.success) {
    throw new ApiError('Response failed schema validation', {
      code: 'invalid_response_shape',
      status: response.status,
      details: result.error.flatten(),
    })
  }

  return result.data
}
