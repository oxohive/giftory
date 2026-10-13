import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { dealerHandler, readParam } from '../../../../../../lib/http'
import { DEALER_DOCUMENT_ENTITY_ID, DEALER_DOCUMENT_ATTACHMENT_PARTITION } from '../../../../../../lib/constants'
import { loadOwnDealerDocument } from '../../../../../../commands/shared'
import { dealerTag, commonDealerErrors } from '../../../../../openapi'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dealer_onboarding.view_own'] },
}

/**
 * GET /api/dealer/onboarding/documents/:id/file — download one of the
 * caller's own KYC documents.
 *
 * The document row and the underlying attachment are both re-checked against
 * the caller's own (session-derived) dealer profile — a dealer can never
 * read another dealer's KYC document by guessing/enumerating its id.
 */
export const GET = dealerHandler('dealer.documents.file', async ({ req, ctx, container, auth }) => {
  if (!auth?.tenantId || !auth?.orgId) {
    return NextResponse.json({ error: 'Authentication required', code: 'authentication_required' }, { status: 401 })
  }
  const id = readParam(ctx, 'id')
  if (!id) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })

  const em = container.resolve<EntityManager>('em')
  const { profile, document } = await loadOwnDealerDocument(em, auth.orgId, auth.tenantId, id)

  const attachmentService = container.resolve<AttachmentService>('attachmentService')
  const url = new URL(req.url)
  const result = await attachmentService.readScoped({
    attachmentId: document.storageKey,
    auth,
    expectedOwner: { entityId: DEALER_DOCUMENT_ENTITY_ID, recordId: profile.id },
    expectedPartitionCode: DEALER_DOCUMENT_ATTACHMENT_PARTITION,
    requirePrivatePartition: true,
    forceDownload: url.searchParams.get('download') === '1',
  })

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      'Content-Type': result.contentType,
      'Content-Disposition': result.contentDisposition,
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  })
})

export const openApi: OpenApiRouteDoc = {
  tag: dealerTag,
  summary: "Download one of the caller's own KYC documents",
  pathParams: z.object({ id: z.string().uuid().describe('DealerKycDocument ID') }),
  methods: {
    GET: {
      summary: 'Download KYC document file',
      tags: [dealerTag],
      responses: [{ status: 200, description: 'Binary file content', schema: z.any() }],
      errors: [{ status: 404, description: 'Not found' }, ...commonDealerErrors()],
    },
  },
}
