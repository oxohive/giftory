import { NextResponse } from 'next/server'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { dealerHandler, readJsonBody, parseOrThrow } from '../../../../lib/http'
import { dealerDocumentUploadSchema } from '../../../../data/validators'
import { DEALER_UPLOAD_DOCUMENT_COMMAND } from '../../../../lib/constants'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { dealerTag, documentUploadResponseSchema, commonDealerErrors } from '../../../openapi'
import type { DealerKycDocument } from '../../../../data/entities'

export const metadata = {
  POST: {
    requireAuth: true,
    requireFeatures: ['dealer_onboarding.submit'],
    rateLimit: { points: 20, duration: 60 * 60, blockDuration: 300, keyPrefix: 'dealer-doc-upload' },
  },
}

export const POST = dealerHandler('dealer.documents', async ({ req, container, auth, organizationScope, translate }) => {
  if (!auth?.tenantId || !auth?.orgId) {
    return NextResponse.json({ error: 'Authentication required', code: 'authentication_required' }, { status: 401 })
  }

  const body = await readJsonBody(req)
  const parsed = parseOrThrow(dealerDocumentUploadSchema, body, translate)

  const commandBus = container.resolve<CommandBus>('commandBus')
  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope,
    selectedOrganizationId: auth.orgId,
    organizationIds: organizationScope?.organizationIds ?? [auth.orgId],
    systemActor: false,
  }

  const { result } = await commandBus.execute<typeof parsed, DealerKycDocument>(DEALER_UPLOAD_DOCUMENT_COMMAND, {
    input: { ...parsed, tenantId: auth.tenantId, organizationId: auth.orgId },
    ctx,
  })

  return NextResponse.json(
    { id: result.id, documentType: result.documentType, fileName: result.fileName },
    { status: 201 },
  )
})

export const openApi: OpenApiRouteDoc = {
  tag: dealerTag,
  summary: 'Upload KYC document',
  methods: {
    POST: {
      summary: 'Register an uploaded KYC document',
      description:
        'Records a KYC document that was uploaded to object storage. The client must obtain a pre-signed upload URL separately and complete the S3 upload before calling this endpoint.',
      tags: [dealerTag],
      body: dealerDocumentUploadSchema,
      responses: [{ status: 201, description: 'Document registered', schema: documentUploadResponseSchema }],
      errors: [{ status: 401, description: 'Authentication required' }, { status: 400, description: 'Cannot upload in current status' }, ...commonDealerErrors()],
    },
  },
}
