import { NextResponse } from 'next/server'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { dealerHandler, readJsonBody, parseOrThrow } from '../../../../lib/http'
import { staffInviteSchema } from '../../../../data/validators'
import { DEALER_STAFF_INVITE_COMMAND } from '../../../../lib/constants'
import { dealerTag, staffInviteResponseSchema, commonDealerErrors } from '../../../openapi'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dealer_org.manage_staff'] },
}

export const POST = dealerHandler('dealer.staff.invite', async ({ req, container, auth, organizationScope, translate }) => {
  if (!auth?.tenantId || !auth?.orgId) {
    return NextResponse.json({ error: 'Authentication required', code: 'authentication_required' }, { status: 401 })
  }

  const body = await readJsonBody(req)
  const parsed = parseOrThrow(staffInviteSchema, body, translate)

  const commandBus = container.resolve<CommandBus>('commandBus')
  const cmdCtx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope,
    selectedOrganizationId: auth.orgId,
    organizationIds: organizationScope?.organizationIds ?? [auth.orgId],
    systemActor: false,
  }

  const { result } = await commandBus.execute(DEALER_STAFF_INVITE_COMMAND, {
    input: { ...parsed, organizationId: auth.orgId, tenantId: auth.tenantId },
    ctx: cmdCtx,
  })

  return NextResponse.json(result, { status: 201 })
})

export const openApi: OpenApiRouteDoc = {
  tag: dealerTag,
  summary: 'Invite staff user',
  methods: {
    POST: {
      summary: 'Invite a staff user to the dealer organization',
      description: 'Creates an OM user with dealer:staff role scoped to this dealer org and sends an invite email. Requires dealer:owner role.',
      tags: [dealerTag],
      body: staffInviteSchema,
      responses: [{ status: 201, description: 'Staff user invited', schema: staffInviteResponseSchema }],
      errors: [{ status: 403, description: 'Only dealer:owner can invite staff' }, ...commonDealerErrors()],
    },
  },
}
