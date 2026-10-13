import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { dealerHandler, readJsonBody, parseOrThrow, readParam } from '../../../../../../lib/http'
import { DEALER_REJECT_COMMAND } from '../../../../../../lib/constants'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { adminDealerTag, rejectResponseSchema, commonAdminErrors } from '../../../../../openapi'

const rejectBodySchema = z.object({ reason: z.string().trim().min(1).max(2000) })

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dealer_onboarding.admin'] },
}

export const POST = dealerHandler('admin.dealers.reject', async ({ req, ctx, container, auth, organizationScope, translate }) => {
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Authentication required', code: 'authentication_required' }, { status: 401 })
  }

  const id = readParam(ctx, 'id')
  if (!id) return NextResponse.json({ error: 'Missing id', code: 'invalid_request' }, { status: 400 })

  const body = await readJsonBody(req)
  const { reason } = parseOrThrow(rejectBodySchema, body, translate)

  const commandBus = container.resolve<CommandBus>('commandBus')
  const cmdCtx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope,
    selectedOrganizationId: auth.orgId,
    organizationIds: organizationScope?.organizationIds ?? (auth.orgId ? [auth.orgId] : []),
    systemActor: false,
  }

  await commandBus.execute(DEALER_REJECT_COMMAND, {
    input: { id, reason, tenantId: auth.tenantId },
    ctx: cmdCtx,
  })

  return NextResponse.json({ ok: true })
})

export const openApi: OpenApiRouteDoc = {
  tag: adminDealerTag,
  summary: 'Reject dealer application',
  methods: {
    POST: {
      summary: 'Reject a dealer application',
      description: 'Rejects the application with a mandatory reason. The dealer can then resubmit once.',
      tags: [adminDealerTag],
      body: rejectBodySchema,
      responses: [{ status: 200, description: 'Rejected', schema: rejectResponseSchema }],
      errors: commonAdminErrors(),
    },
  },
}
