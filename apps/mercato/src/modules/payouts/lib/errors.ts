/**
 * Dependency-free error/translate types shared by routes, commands and libs.
 * Kept out of `lib/http.ts` so command code (and its unit tests) does not
 * pull in the DI container / database driver just to throw a typed error.
 */

export type Translate = (key: string, fallback: string, vars?: Record<string, string | number>) => string
export type RouteCtx = { params?: Record<string, string | string[]> }

export class PayoutsError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'PayoutsError'
  }
}
