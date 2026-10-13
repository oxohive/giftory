import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { dealerHandler, readParam } from '../../../../../lib/http'
import { DealerProfile, DealerKycDocument } from '../../../../../data/entities'
import { adminDealerTag, adminApplicationDetailSchema, commonAdminErrors } from '../../../../openapi'
import { serializeDealerProfile } from '../../../../../commands/register'
import { serializeDealerDocument } from '../../../../../commands/documents'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dealer_onboarding.admin'] },
}

export const GET = dealerHandler('admin.dealers.applications.get', async ({ req, ctx, container, auth }) => {
  const tenantId = auth?.tenantId ?? null
  if (!tenantId) {
    return NextResponse.json({ error: 'Authentication required', code: 'authentication_required' }, { status: 401 })
  }

  const id = readParam(ctx, 'id')
  if (!id) return NextResponse.json({ error: 'Missing id', code: 'invalid_request' }, { status: 400 })

  const em = container.resolve<EntityManager>('em')

  // Decrypt GSTIN and PAN for admin view.
  const profiles = await findWithDecryption<DealerProfile>(
    em,
    container,
    DealerProfile,
    { id, tenantId, deletedAt: null },
    { tenantId, organizationId: id },
  )
  const profile = profiles[0] ?? null
  if (!profile) {
    return NextResponse.json({ error: 'Application not found', code: 'not_found' }, { status: 404 })
  }

  const documents = await em.find(DealerKycDocument, { dealerProfileId: profile.id, deletedAt: null })

  return NextResponse.json({
    ...serializeDealerProfile(profile),
    gstin: (profile as DealerProfile & { gstin?: string | null }).gstin ?? null,
    pan: (profile as DealerProfile & { pan?: string | null }).pan ?? null,
    documents: documents.map(serializeDealerDocument),
  })
})

export const openApi: OpenApiRouteDoc = {
  tag: adminDealerTag,
  summary: 'Get application detail',
  methods: {
    GET: {
      summary: 'Get dealer application detail',
      description: 'Returns full application including decrypted GSTIN/PAN and uploaded documents.',
      tags: [adminDealerTag],
      responses: [{ status: 200, description: 'Application detail', schema: adminApplicationDetailSchema }],
      errors: commonAdminErrors(),
    },
  },
}
