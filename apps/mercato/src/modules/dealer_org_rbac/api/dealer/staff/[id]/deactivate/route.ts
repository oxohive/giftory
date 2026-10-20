import { NextResponse } from 'next/server'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { dealerHandler, readParam } from '../../../../../lib/http'
import { DEALER_STAFF_DEACTIVATE_COMMAND } from '../../../../../lib/constants'
import { dealerTag, staffDeactivateResponseSchema, commonDealerErrors } from '../../../../openapi'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dealer_org.manage_staff'] },
}

/**
 * POST /api/dealer/staff/:id/deactivate — deactivate one of the caller's own
 * dealer:staff users.
 *
 * See `commands/staff.ts`'s `executeStaffDeactivate` for the full
 * authorization and revocation contract: an owner can never deactivate
 * themselves, the target must resolve as a `dealer:staff` member of the
 * caller's own org, and deactivation is performed through the installed
 * `auth.users.update` command (`isConfirmed: false`) — the same flag the
 * auth module's session-integrity check enforces on every request, so this
 * genuinely revokes access rather than flipping a flag nothing checks.
 */
export const POST = dealerHandler('dealer.staff.deactivate', async ({ ctx: routeCtx, container, auth, organizationScope }) => {
  if (!auth?.tenantId || !auth?.orgId) {
    return NextResponse.json({ error: 'Authentication required', code: 'authentication_required' }, { status: 401 })
  }
  const id = readParam(routeCtx, 'id')
  if (!id) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })

  const commandBus = container.resolve<CommandBus>('commandBus')
  const cmdCtx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope,
    selectedOrganizationId: auth.orgId,
    organizationIds: [auth.orgId],
    systemActor: false,
  }

  const { result } = await commandBus.execute(DEALER_STAFF_DEACTIVATE_COMMAND, {
    input: { userId: id, organizationId: auth.orgId, tenantId: auth.tenantId },
    ctx: cmdCtx,
  })

  return NextResponse.json(result)
})

export const openApi: OpenApiRouteDoc = {
  tag: dealerTag,
  summary: 'Deactivate a dealer staff user',
  pathParams: z.object({ id: z.string().uuid().describe('User ID') }),
  methods: {
    POST: {
      summary: 'Deactivate one of the caller\'s own dealer:staff users',
      description: 'Only dealer:owner may call this. An owner cannot deactivate themselves, and the target must be a dealer:staff user of the caller\'s own org.',
      tags: [dealerTag],
      responses: [{ status: 200, description: 'Deactivated', schema: staffDeactivateResponseSchema }],
      errors: [{ status: 400, description: 'Cannot deactivate self' }, { status: 404, description: 'Staff user not found' }, ...commonDealerErrors()],
    },
  },
}
