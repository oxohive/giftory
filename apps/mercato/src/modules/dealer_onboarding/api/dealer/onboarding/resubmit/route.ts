import { NextResponse } from 'next/server'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { dealerHandler, readJsonBody, parseOrThrow } from '../../../../lib/http'
import { dealerResubmitSchema } from '../../../../data/validators'
import { DEALER_RESUBMIT_COMMAND } from '../../../../lib/constants'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { dealerTag, resubmitResponseSchema, commonDealerErrors } from '../../../openapi'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dealer_onboarding.submit'] },
}

export const POST = dealerHandler('dealer.resubmit', async ({ req, container, auth, organizationScope, translate }) => {
  if (!auth?.tenantId || !auth?.orgId) {
    return NextResponse.json({ error: 'Authentication required', code: 'authentication_required' }, { status: 401 })
  }

  const body = await readJsonBody(req)
  const parsed = parseOrThrow(dealerResubmitSchema, body, translate)

  const commandBus = container.resolve<CommandBus>('commandBus')
  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope,
    selectedOrganizationId: auth.orgId,
    organizationIds: organizationScope?.organizationIds ?? [auth.orgId],
    systemActor: false,
  }

  await commandBus.execute(DEALER_RESUBMIT_COMMAND, {
    input: { ...parsed, tenantId: auth.tenantId, organizationId: auth.orgId },
    ctx,
  })

  return NextResponse.json({ ok: true })
})

export const openApi: OpenApiRouteDoc = {
  tag: dealerTag,
  summary: 'Resubmit rejected application',
  methods: {
    POST: {
      summary: 'Resubmit after rejection',
      description: 'Updates the dealer application and moves it back to under_review. Only possible from the rejected status.',
      tags: [dealerTag],
      body: dealerResubmitSchema,
      responses: [{ status: 200, description: 'Resubmission accepted', schema: resubmitResponseSchema }],
      errors: [{ status: 401, description: 'Authentication required' }, { status: 400, description: 'Cannot resubmit in current status' }, ...commonDealerErrors()],
    },
  },
}
