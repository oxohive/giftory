/**
 * Typed error thrown by `apiRequest()` (see http.ts) for any non-2xx response
 * or response-shape validation failure. Domain modules (TASK-04) and feature
 * code (TASK-05..08) should catch this specifically when they need to branch
 * on `.code` (e.g. to show a "cart item out of stock" message) rather than
 * parsing `error.message` strings.
 */

export interface ApiErrorOptions {
  code: string
  status: number
  details?: unknown
}

export class ApiError extends Error {
  code: string
  status: number
  details?: unknown

  constructor(message: string, opts: ApiErrorOptions) {
    super(message)
    this.name = 'ApiError'
    this.code = opts.code
    this.status = opts.status
    this.details = opts.details

    // Restore the prototype chain. Some TS/Babel target combinations (notably
    // down-compiling to ES5) break `instanceof` checks on classes that extend
    // the built-in Error otherwise.
    Object.setPrototypeOf(this, ApiError.prototype)
  }
}

export interface ClassifiedError {
  kind: 'validation' | 'server' | 'network'
  message: string
}

const SERVER_ERROR_MESSAGE = 'Something went wrong on our end. Please try again in a moment.'
const NETWORK_ERROR_MESSAGE = 'Could not reach the server. Check your connection and try again.'

/**
 * Shared network/server/validation classification (checklist section 7:
 * "Define network-failure state" / "Define server/API-error state" as
 * DISTINCT states, not one generic error message). Previously only
 * `PaymentScreen`'s local `describeOrderError` made this distinction —
 * every other screen's `ErrorState` collapsed all failures into one
 * message. Screens should pass `classifyApiError(error).message` to
 * `ErrorState` instead of `error?.message` directly.
 */
export function classifyApiError(err: unknown): ClassifiedError {
  if (err instanceof ApiError) {
    if (err.status >= 500 || err.status === 0) {
      return { kind: 'server', message: SERVER_ERROR_MESSAGE }
    }
    return { kind: 'validation', message: err.message }
  }
  if (err instanceof Error) {
    return { kind: 'network', message: NETWORK_ERROR_MESSAGE }
  }
  return { kind: 'network', message: NETWORK_ERROR_MESSAGE }
}
