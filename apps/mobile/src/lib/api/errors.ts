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
