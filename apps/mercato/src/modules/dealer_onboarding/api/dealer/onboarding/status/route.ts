import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { dealerHandler } from '../../../../lib/http'
import { DealerProfile, DealerKycDocument } from '../../../../data/entities'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { dealerTag, statusResponseSchema, commonDealerErrors } from '../../../openapi'
import { serializeDealerProfile } from '../../../../commands/register'
import { serializeDealerDocument } from '../../../../commands/documents'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dealer_onboarding.view_own'] },
}

export const GET = dealerHandler('dealer.status', async ({ container, auth }) => {
  const tenantId = auth?.tenantId ?? null
  const organizationId = auth?.orgId ?? null

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Authentication required', code: 'authentication_required' }, { status: 401 })
  }

  const em = container.resolve<EntityManager>('em')
  const profile = await em.findOne(DealerProfile, { organizationId, tenantId, deletedAt: null })
  if (!profile) {
    return NextResponse.json({ error: 'Dealer profile not found', code: 'profile_not_found' }, { status: 404 })
  }

  const documents = await em.find(DealerKycDocument, { dealerProfileId: profile.id, deletedAt: null })

  return NextResponse.json({
    ...serializeDealerProfile(profile),
    documents: documents.map(serializeDealerDocument),
  })
})

export const openApi: OpenApiRouteDoc = {
  tag: dealerTag,
  summary: 'Get own application status',
  methods: {
    GET: {
      summary: 'Get dealer application status',
      description: "Returns the authenticated dealer's KYC status and uploaded documents.",
      tags: [dealerTag],
      responses: [{ status: 200, description: 'Application status with documents', schema: statusResponseSchema }],
      errors: [{ status: 401, description: 'Authentication required' }, ...commonDealerErrors()],
    },
  },
}
