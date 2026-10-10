import { NextResponse } from 'next/server'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { dealerHandler, readJsonBody, parseOrThrow, readParam } from '../../../../../lib/http'
import { capabilitiesUpsertSchema } from '../../../../../data/validators'
import { DEALER_CAPABILITIES_UPSERT_COMMAND } from '../../../../../lib/constants'
import { adminDealerTag, capabilitiesUpdateResponseSchema, commonAdminErrors } from '../../../../openapi'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['dealer_org.admin'] },
}

export const PUT = dealerHandler('admin.dealers.capabilities.update', async ({ req, ctx, container, auth, organizationScope, translate }) => {
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Authentication required', code: 'authentication_required' }, { status: 401 })
  }

  const id = readParam(ctx, 'id')
  if (!id) return NextResponse.json({ error: 'Missing id', code: 'invalid_request' }, { status: 400 })

  const body = await readJsonBody(req)
  const parsed = parseOrThrow(capabilitiesUpsertSchema, body, translate)

  const commandBus = container.resolve<CommandBus>('commandBus')
  const cmdCtx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope,
    selectedOrganizationId: auth.orgId,
    organizationIds: organizationScope?.organizationIds ?? (auth.orgId ? [auth.orgId] : []),
    systemActor: false,
  }

  const { result } = await commandBus.execute(DEALER_CAPABILITIES_UPSERT_COMMAND, {
    input: { ...parsed, dealerProfileId: id, tenantId: auth.tenantId },
    ctx: cmdCtx,
  })

  return NextResponse.json(result)
})

export const openApi: OpenApiRouteDoc = {
  tag: adminDealerTag,
  summary: 'Update dealer capabilities',
  methods: {
    PUT: {
      summary: 'Update dealer capability configuration',
      description: 'Admin replaces all capability fields for a specific dealer.',
      tags: [adminDealerTag],
      body: capabilitiesUpsertSchema,
      responses: [{ status: 200, description: 'Updated capabilities', schema: capabilitiesUpdateResponseSchema }],
      errors: commonAdminErrors(),
    },
  },
}
