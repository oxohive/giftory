import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { dealerHandler, readParam } from '../../../../lib/http'
import { DealerCapability } from '../../../../data/entities'
import { findProfileById, serializeCapabilities } from '../../../../commands/shared'
import { adminDealerTag, dealerDetailWireSchema, commonAdminErrors } from '../../../openapi'
import { serializeDealerProfile } from '../../../../../dealer_onboarding/commands/register'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dealer_org.admin'] },
}

export const GET = dealerHandler('admin.dealers.get', async ({ ctx, container, auth }) => {
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Authentication required', code: 'authentication_required' }, { status: 401 })
  }

  const id = readParam(ctx, 'id')
  if (!id) return NextResponse.json({ error: 'Missing id', code: 'invalid_request' }, { status: 400 })

  const em = container.resolve<EntityManager>('em')
  const profile = await findProfileById(em, id, auth.tenantId)

  if (profile.kycStatus !== 'approved') {
    return NextResponse.json({ error: 'Dealer not found', code: 'not_found' }, { status: 404 })
  }

  const cap = await em.findOne(DealerCapability, { dealerProfileId: profile.id, tenantId: auth.tenantId, deletedAt: null })

  return NextResponse.json({ ...serializeDealerProfile(profile), capabilities: serializeCapabilities(cap) })
})

export const openApi: OpenApiRouteDoc = {
  tag: adminDealerTag,
  summary: 'Get dealer detail',
  methods: {
    GET: {
      summary: 'Get approved dealer detail',
      description: 'Returns dealer profile and capabilities. Requires dealer to be approved.',
      tags: [adminDealerTag],
      responses: [{ status: 200, description: 'Dealer detail', schema: dealerDetailWireSchema }],
      errors: commonAdminErrors(),
    },
  },
}
