import { NextResponse } from 'next/server'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { dealerHandler, readJsonBody, parseOrThrow } from '../../../../lib/http'
import { capabilitiesUpsertSchema } from '../../../../data/validators'
import { DEALER_CAPABILITIES_UPSERT_COMMAND } from '../../../../lib/constants'
import { dealerTag, capabilitiesUpdateResponseSchema, commonDealerErrors } from '../../../openapi'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['dealer_org.manage_capabilities'] },
}

export const PUT = dealerHandler('dealer.profile.capabilities.update', async ({ req, container, auth, organizationScope, translate }) => {
  if (!auth?.tenantId || !auth?.orgId) {
    return NextResponse.json({ error: 'Authentication required', code: 'authentication_required' }, { status: 401 })
  }

  const body = await readJsonBody(req)
  const parsed = parseOrThrow(capabilitiesUpsertSchema, body, translate)

  const commandBus = container.resolve<CommandBus>('commandBus')
  const cmdCtx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope,
    selectedOrganizationId: auth.orgId,
    organizationIds: organizationScope?.organizationIds ?? [auth.orgId],
    systemActor: false,
  }

  const { result } = await commandBus.execute(DEALER_CAPABILITIES_UPSERT_COMMAND, {
    input: { ...parsed, organizationId: auth.orgId, tenantId: auth.tenantId },
    ctx: cmdCtx,
  })

  return NextResponse.json(result)
})

export const openApi: OpenApiRouteDoc = {
  tag: dealerTag,
  summary: 'Update own capabilities',
  methods: {
    PUT: {
      summary: 'Update dealer capability configuration',
      description: 'Dealer owner replaces their capability configuration. Requires dealer:owner role.',
      tags: [dealerTag],
      body: capabilitiesUpsertSchema,
      responses: [{ status: 200, description: 'Updated capabilities', schema: capabilitiesUpdateResponseSchema }],
      errors: [{ status: 403, description: 'Only dealer:owner can update capabilities' }, ...commonDealerErrors()],
    },
  },
}
