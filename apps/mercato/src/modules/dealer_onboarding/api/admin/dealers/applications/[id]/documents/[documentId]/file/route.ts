import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { dealerHandler, readParam } from '../../../../../../../../lib/http'
import { DEALER_DOCUMENT_ENTITY_ID, DEALER_DOCUMENT_ATTACHMENT_PARTITION } from '../../../../../../../../lib/constants'
import { loadDealerDocumentForReview, buildReviewerAttachmentAuth } from '../../../../../../../../commands/shared'
import { adminDealerTag, commonAdminErrors } from '../../../../../../../openapi'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dealer_onboarding.admin'] },
}

/**
 * GET /api/admin/dealers/applications/:id/documents/:documentId/file —
 * admin review download for one applicant's KYC document.
 *
 * `:id` is the dealer application (DealerProfile) id, scoped to the caller's
 * tenant only — mirrors the existing admin application-detail route's trust
 * boundary (an admin with `dealer_onboarding.admin` may review any
 * application in their tenant, regardless of which organization they are
 * currently viewing). The document is additionally re-checked as belonging
 * to that exact application before any byte is read, so this never becomes
 * a generic cross-tenant/cross-dealer attachment-id oracle.
 *
 * The underlying attachment is scoped (tenantId, organizationId) to the
 * dealer's own organization, not the admin's — `readScoped` requires the
 * `auth` it is given to carry the scope being read, so the admin's real
 * session auth is cloned with `orgId` switched to the dealer's organization
 * for this one read, exactly as its own documentation describes ("a super
 * admin reads another tenant's attachment by switching scope, not by
 * bypassing the filter"). The two independent checks above (tenant-scoped
 * admin feature + document belongs to this specific, already-tenant-scoped
 * application) are what authorize that scope switch — it grants nothing
 * beyond the one document this request already proved access to.
 */
export const GET = dealerHandler('admin.dealers.applications.documents.file', async ({ req, ctx, container, auth }) => {
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Authentication required', code: 'authentication_required' }, { status: 401 })
  }
  const applicationId = readParam(ctx, 'id')
  const documentId = readParam(ctx, 'documentId')
  if (!applicationId || !documentId) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })

  const em = container.resolve<EntityManager>('em')
  const { profile, document } = await loadDealerDocumentForReview(em, auth.tenantId, applicationId, documentId)

  const attachmentService = container.resolve<AttachmentService>('attachmentService')
  const url = new URL(req.url)
  const result = await attachmentService.readScoped({
    attachmentId: document.storageKey,
    auth: buildReviewerAttachmentAuth(auth, profile),
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
  tag: adminDealerTag,
  summary: "Download an applicant's KYC document (admin review)",
  pathParams: z.object({
    id: z.string().uuid().describe('DealerProfile (application) ID'),
    documentId: z.string().uuid().describe('DealerKycDocument ID'),
  }),
  methods: {
    GET: {
      summary: 'Download KYC document file for review',
      tags: [adminDealerTag],
      responses: [{ status: 200, description: 'Binary file content', schema: z.any() }],
      errors: [{ status: 404, description: 'Not found' }, ...commonAdminErrors()],
    },
  },
}
