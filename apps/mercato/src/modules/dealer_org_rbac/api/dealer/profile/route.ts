import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { dealerHandler } from '../../../lib/http'
import { DealerCapability } from '../../../data/entities'
import { findOwnProfile, serializeCapabilities } from '../../../commands/shared'
import { dealerTag, dealerDetailWireSchema, commonDealerErrors } from '../../openapi'
import { serializeDealerProfile } from '../../../../dealer_onboarding/commands/register'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dealer_org.view'] },
}

export const GET = dealerHandler('dealer.profile.get', async ({ container, auth }) => {
  if (!auth?.tenantId || !auth?.orgId) {
    return NextResponse.json({ error: 'Authentication required', code: 'authentication_required' }, { status: 401 })
  }

  const em = container.resolve<EntityManager>('em')
  const profile = await findOwnProfile(em, auth.orgId, auth.tenantId)
  const cap = await em.findOne(DealerCapability, {
    dealerProfileId: profile.id,
    tenantId: auth.tenantId,
    deletedAt: null,
  })

  return NextResponse.json({ ...serializeDealerProfile(profile), capabilities: serializeCapabilities(cap) })
})

export const openApi: OpenApiRouteDoc = {
  tag: dealerTag,
  summary: 'Get dealer profile',
  methods: {
    GET: {
      summary: 'Get own dealer profile and capabilities',
      description: 'Returns the authenticated dealer\'s profile and their current capability configuration.',
      tags: [dealerTag],
      responses: [{ status: 200, description: 'Dealer profile with capabilities', schema: dealerDetailWireSchema }],
      errors: commonDealerErrors(),
    },
  },
}
