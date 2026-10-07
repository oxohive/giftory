import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer, type AppContainer } from '@open-mercato/shared/lib/di/container'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { StorefrontErrorCode } from './constants'
import { resolveShopper, type ShopperContext } from './scope'

const logger = createLogger('storefront').child({ component: 'http' })

export type Translate = (key: string, fallback: string, vars?: Record<string, string | number>) => string

export type RouteContext = { params?: Record<string, string | string[]> }

export const errorBodySchema = z
  .object({ error: z.string(), code: z.string().optional(), details: z.unknown().optional() })
  .passthrough()

export function errorResponse(
  status: number,
  code: StorefrontErrorCode | string,
  message: string,
  extra?: Record<string, unknown>,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json({ error: message, code, ...(extra ?? {}) }, { status, headers })
}

/** Thrown by services for expected failures; mapped to `{ error, code }` responses. */
export class StorefrontError extends Error {
  /** Cookies that must still reach the client with the error (e.g. guest order access). */
  cookies: CookieSpec[] = []

  constructor(
    readonly status: number,
    readonly code: StorefrontErrorCode | string,
    message: string,
    readonly extra?: Record<string, unknown>,
    readonly headers?: Record<string, string>,
  ) {
    super(message)
    this.name = 'StorefrontError'
  }
}

export function readParam(ctx: RouteContext | undefined, name: string): string | null {
  const value = ctx?.params?.[name]
  if (Array.isArray(value)) return value[0] ?? null
  return typeof value === 'string' && value.length > 0 ? value : null
}

export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    const text = await req.text()
    return text ? (JSON.parse(text) as unknown) : {}
  } catch {
    return undefined
  }
}

export type StorefrontHandlerArgs = {
  req: Request
  ctx: RouteContext | undefined
  container: AppContainer
  shopper: ShopperContext
  translate: Translate
}

/**
 * Shared wrapper for public storefront routes: resolves the shop + shopper,
 * maps `StorefrontError` / `CrudHttpError` / Zod errors to `{ error, code }`
 * bodies and never leaks internals on unexpected failures.
 */
export function storefrontHandler(
  component: string,
  handler: (args: StorefrontHandlerArgs) => Promise<Response>,
): (req: Request, ctx?: RouteContext) => Promise<Response> {
  return async (req: Request, ctx?: RouteContext) => {
    const { translate } = await resolveTranslations()
    try {
      const container = await createRequestContainer()
      const resolution = await resolveShopper(req, container)
      if (!resolution.ok) {
        const message =
          resolution.code === 'shop_required'
            ? translate('storefront.errors.shopRequired', 'Shop identifier is required')
            : translate('storefront.errors.shopNotFound', 'Shop not found')
        return errorResponse(resolution.status, resolution.code, message)
      }
      return await handler({ req, ctx, container, shopper: resolution.shopper, translate })
    } catch (err) {
      if (err instanceof StorefrontError) {
        return applyCookies(errorResponse(err.status, err.code, err.message, err.extra, err.headers), err.cookies)
      }
      if (err instanceof z.ZodError) {
        return errorResponse(422, 'invalid_request', translate('storefront.errors.invalidRequest', 'Invalid request'), {
          details: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        })
      }
      if (isCrudHttpError(err)) {
        const body = err.body ?? {}
        const message = typeof body.error === 'string' ? body.error : translate('storefront.errors.requestFailed', 'Request failed')
        return errorResponse(err.status, typeof body.code === 'string' ? body.code : 'invalid_request', message)
      }
      logger.error('Storefront request failed', { component, err })
      return errorResponse(500, 'internal_error', translate('storefront.errors.internal', 'Something went wrong. Please try again.'))
    }
  }
}

export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, value: unknown, translate: Translate): z.infer<T> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new StorefrontError(422, 'invalid_request', translate('storefront.errors.invalidRequest', 'Invalid request'), {
      details: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    })
  }
  return parsed.data
}

export function requireCustomer(shopper: ShopperContext, translate: Translate) {
  if (!shopper.customer) {
    throw new StorefrontError(401, 'authentication_required', translate('storefront.errors.authRequired', 'Please sign in to continue'))
  }
  return shopper.customer
}

export type CookieSpec = { name: string; value: string; maxAge: number }

export function applyCookies(response: NextResponse, cookies: CookieSpec[]): NextResponse {
  for (const cookie of cookies) {
    response.cookies.set(cookie.name, cookie.value, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: cookie.maxAge,
    })
  }
  return response
}
