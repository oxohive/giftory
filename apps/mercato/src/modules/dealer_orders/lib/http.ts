import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer, type AppContainer } from '@open-mercato/shared/lib/di/container'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'

const logger = createLogger('dealer_orders').child({ component: 'http' })

export type Translate = (key: string, fallback: string, vars?: Record<string, string | number>) => string
export type RouteCtx = { params?: Record<string, string | string[]> }

export class DealerOrdersError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'DealerOrdersError'
  }
}

export function errorResponse(status: number, code: string, message: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: message, code, ...(extra ?? {}) }, { status })
}

export type AuthScope = {
  tenantId: string
  organizationId: string
  userId: string
}

export type AdminHandlerArgs = {
  req: Request
  routeCtx: RouteCtx | undefined
  container: AppContainer
  scope: AuthScope
  translate: Translate
}

/**
 * Shared wrapper for dealer_orders admin API routes.
 * Resolves auth, creates the DI container, and maps errors to `{ error, code }`.
 */
export function adminHandler(
  component: string,
  handler: (args: AdminHandlerArgs) => Promise<Response>,
): (req: Request, routeCtx?: RouteCtx) => Promise<Response> {
  return async (req: Request, routeCtx?: RouteCtx) => {
    const { translate } = await resolveTranslations()
    try {
      const auth = await getAuthFromRequest(req)
      if (!auth?.tenantId || !auth.sub) {
        return errorResponse(401, 'unauthorized', translate('dealer_orders.errors.unauthorized', 'Authentication required'))
      }
      if (!auth.orgId) {
        return errorResponse(400, 'org_scope_required', translate('dealer_orders.errors.orgScopeRequired', 'Organization scope required'))
      }
      const scope: AuthScope = { tenantId: auth.tenantId, organizationId: auth.orgId, userId: String(auth.sub) }
      const container = await createRequestContainer()
      return await handler({ req, routeCtx, container, scope, translate })
    } catch (err) {
      if (err instanceof DealerOrdersError) {
        return errorResponse(err.status, err.code, err.message, err.extra)
      }
      if (err instanceof z.ZodError) {
        return errorResponse(422, 'invalid_request', translate('dealer_orders.errors.invalidRequest', 'Invalid request'), {
          details: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        })
      }
      if (isCrudHttpError(err)) {
        const body = (err as { body?: Record<string, unknown> }).body ?? {}
        const message = typeof body.error === 'string' ? body.error : translate('dealer_orders.errors.requestFailed', 'Request failed')
        return errorResponse(err.status, typeof body.code === 'string' ? body.code : 'request_failed', message)
      }
      logger.error('Dealer orders admin API request failed', { component, err })
      return errorResponse(500, 'internal_error', translate('dealer_orders.errors.internal', 'Something went wrong'))
    }
  }
}

export function buildCommandContext(container: AppContainer, scope: AuthScope, req: Request): CommandRuntimeContext {
  return {
    container,
    auth: { tenantId: scope.tenantId, orgId: scope.organizationId, sub: scope.userId, isSuperAdmin: false } as CommandRuntimeContext['auth'],
    organizationScope: null,
    selectedOrganizationId: scope.organizationId,
    organizationIds: [scope.organizationId],
    systemActor: false,
    request: req,
  }
}

export async function runAdminCommand<TResult>(
  container: AppContainer,
  commandId: string,
  input: Record<string, unknown>,
  scope: AuthScope,
  req: Request,
): Promise<TResult> {
  const commandBus = container.resolve('commandBus') as CommandBus
  const ctx = buildCommandContext(container, scope, req)
  const { result } = await commandBus.execute<Record<string, unknown>, TResult>(commandId, { input, ctx })
  return result
}

export function readRouteParam(routeCtx: RouteCtx | undefined, name: string): string | null {
  const value = routeCtx?.params?.[name]
  if (Array.isArray(value)) return value[0] ?? null
  return typeof value === 'string' && value.length > 0 ? value : null
}

export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    const text = await req.text()
    return text ? (JSON.parse(text) as unknown) : {}
  } catch {
    return {}
  }
}

export function requireIdempotencyKey(req: Request, translate: Translate): string {
  const key = req.headers.get('Idempotency-Key')
  if (!key || key.trim().length === 0) {
    throw new DealerOrdersError(
      400,
      'idempotency_key_required',
      translate('dealer_orders.errors.idempotencyKeyRequired', 'Idempotency-Key header is required for this operation'),
    )
  }
  return key.trim()
}
