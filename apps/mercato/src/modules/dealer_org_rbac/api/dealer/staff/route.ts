import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { dealerHandler } from '../../../lib/http'
import { findOwnProfile } from '../../../commands/shared'
import { listDealerOrgUsers } from '../../../lib/staffDirectory'
import { dealerTag, staffListResponseSchema, commonDealerErrors } from '../../openapi'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dealer_org.manage_staff'] },
}

/**
 * GET /api/dealer/staff — the dealer org's owner + staff roster.
 *
 * Scoped to the caller's own (session-derived) organization — never a
 * caller-supplied org id. Requires `dealer_org.manage_staff`, which is
 * granted to `dealer:owner` only (see `setup.ts`), matching the `/staff`
 * page's owner-only contract frozen in CONTRACT-HANDOFF.md.
 */
export const GET = dealerHandler('dealer.staff.list', async ({ container, auth }) => {
  if (!auth?.tenantId || !auth?.orgId) {
    return NextResponse.json({ error: 'Authentication required', code: 'authentication_required' }, { status: 401 })
  }
  const em = container.resolve<EntityManager>('em')
  await findOwnProfile(em, auth.orgId, auth.tenantId)
  const items = await listDealerOrgUsers(em, auth.orgId, auth.tenantId)
  return NextResponse.json({ items })
})

export const openApi: OpenApiRouteDoc = {
  tag: dealerTag,
  summary: 'List dealer org staff',
  methods: {
    GET: {
      summary: "List the dealer org's owner + staff users",
      tags: [dealerTag],
      responses: [{ status: 200, description: 'Staff roster', schema: staffListResponseSchema }],
      errors: commonDealerErrors(),
    },
  },
}
