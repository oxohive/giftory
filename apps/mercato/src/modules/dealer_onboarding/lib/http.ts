import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer, type AppContainer } from '@open-mercato/shared/lib/di/container'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getAuthFromRequest, type AuthContext } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest, type OrganizationScope } from '@open-mercato/core/modules/directory/utils/organizationScope'

const logger = createLogger('dealer_onboarding').child({ component: 'http' })

export type Translate = (key: string, fallback: string, vars?: Record<string, string | number>) => string
export type RouteContext = { params?: Record<string, string | string[]> }

export class DealerApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'DealerApiError'
  }
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: message, code, ...(extra ?? {}) }, { status })
}

export type DealerHandlerArgs = {
  req: Request
  ctx: RouteContext | undefined
  container: AppContainer
  translate: Translate
  auth: AuthContext
  organizationScope: OrganizationScope | null
}

/**
 * Shared wrapper for dealer onboarding API routes.
 * Maps `DealerApiError`, `CrudHttpError`, and Zod errors to `{ error, code }`.
 */
export function dealerHandler(
  component: string,
  handler: (args: DealerHandlerArgs) => Promise<Response>,
): (req: Request, ctx?: RouteContext) => Promise<Response> {
  return async (req: Request, ctx?: RouteContext) => {
    const { translate } = await resolveTranslations()
    try {
      const container = await createRequestContainer()
      const auth = await getAuthFromRequest(req)
      const organizationScope = auth
        ? await resolveOrganizationScopeForRequest(req, container, auth).catch(() => null)
        : null
      return await handler({ req, ctx, container, translate, auth, organizationScope })
    } catch (err) {
      if (err instanceof DealerApiError) {
        return errorResponse(err.status, err.code, err.message, err.extra)
      }
      if (err instanceof z.ZodError) {
        return errorResponse(422, 'invalid_request', translate('dealer_onboarding.errors.invalidRequest', 'Invalid request'), {
          details: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        })
      }
      if (isCrudHttpError(err)) {
        const body = (err as { body?: Record<string, unknown> }).body ?? {}
        const message =
          typeof body.error === 'string'
            ? body.error
            : translate('dealer_onboarding.errors.requestFailed', 'Request failed')
        return errorResponse(err.status, typeof body.code === 'string' ? body.code : 'request_failed', message)
      }
      logger.error('Dealer API request failed', { component, err })
      return errorResponse(500, 'internal_error', translate('dealer_onboarding.errors.internal', 'Something went wrong. Please try again.'))
    }
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

export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, value: unknown, translate: Translate): z.infer<T> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new DealerApiError(422, 'invalid_request', translate('dealer_onboarding.errors.invalidRequest', 'Invalid request'), {
      details: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    })
  }
  return parsed.data
}
