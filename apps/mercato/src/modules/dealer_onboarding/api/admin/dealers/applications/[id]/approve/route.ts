import { NextResponse } from 'next/server'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { dealerHandler, readParam } from '../../../../../../lib/http'
import { DEALER_APPROVE_COMMAND } from '../../../../../../lib/constants'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { adminDealerTag, approveResponseSchema, commonAdminErrors } from '../../../../../openapi'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dealer_onboarding.admin'] },
}

export const POST = dealerHandler('admin.dealers.approve', async ({ req, ctx, container, auth, organizationScope }) => {
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Authentication required', code: 'authentication_required' }, { status: 401 })
  }

  const id = readParam(ctx, 'id')
  if (!id) return NextResponse.json({ error: 'Missing id', code: 'invalid_request' }, { status: 400 })

  const commandBus = container.resolve<CommandBus>('commandBus')
  const cmdCtx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope,
    selectedOrganizationId: auth.orgId,
    organizationIds: organizationScope?.organizationIds ?? (auth.orgId ? [auth.orgId] : []),
    systemActor: false,
  }

  await commandBus.execute(DEALER_APPROVE_COMMAND, {
    input: { id, tenantId: auth.tenantId },
    ctx: cmdCtx,
  })

  return NextResponse.json({ ok: true })
})

export const openApi: OpenApiRouteDoc = {
  tag: adminDealerTag,
  summary: 'Approve dealer application',
  methods: {
    POST: {
      summary: 'Approve a dealer application',
      description: 'Approves the application, activates the OM organization, and scopes the dealer role to their org.',
      tags: [adminDealerTag],
      responses: [{ status: 200, description: 'Approved', schema: approveResponseSchema }],
      errors: commonAdminErrors(),
    },
  },
}
