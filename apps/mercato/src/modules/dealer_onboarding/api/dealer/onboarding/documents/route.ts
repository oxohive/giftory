import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { dealerHandler, DealerApiError } from '../../../../lib/http'
import { DEALER_DOCUMENT_TYPES } from '../../../../lib/constants'
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

const documentTypeSchema = z.enum(DEALER_DOCUMENT_TYPES)

/**
 * POST /api/dealer/onboarding/documents — real file upload.
 *
 * Accepts `multipart/form-data` with fields `documentType` and `file`. The
 * file's bytes are uploaded to private, access-controlled object storage via
 * the attachments module (see `commands/documents.ts`); this route never
 * accepts a client-supplied storage key or trusts a client-declared file
 * size/mime type as the record of truth.
 */
export const POST = dealerHandler('dealer.documents', async ({ req, container, auth, organizationScope, translate }) => {
  if (!auth?.tenantId || !auth?.orgId) {
    return NextResponse.json({ error: 'Authentication required', code: 'authentication_required' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw new DealerApiError(400, 'invalid_request', translate('dealer_onboarding.errors.invalidRequest', 'Invalid request'))
  }

  const documentTypeParsed = documentTypeSchema.safeParse(form.get('documentType'))
  if (!documentTypeParsed.success) {
    throw new DealerApiError(422, 'invalid_request', translate('dealer_onboarding.errors.invalidRequest', 'Invalid request'), {
      details: [{ path: 'documentType', message: 'Unknown document type' }],
    })
  }

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    throw new DealerApiError(422, 'invalid_request', translate('dealer_onboarding.validation.fileRequired', 'A file is required'), {
      details: [{ path: 'file', message: 'A non-empty file is required' }],
    })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  const commandBus = container.resolve<CommandBus>('commandBus')
  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope,
    selectedOrganizationId: auth.orgId,
    organizationIds: [auth.orgId],
    systemActor: false,
  }

  const { result } = await commandBus.execute<Record<string, unknown>, DealerKycDocument>(DEALER_UPLOAD_DOCUMENT_COMMAND, {
    input: {
      documentType: documentTypeParsed.data,
      fileName: file.name || 'document',
      declaredMimeType: file.type || null,
      buffer,
      tenantId: auth.tenantId,
      organizationId: auth.orgId,
    },
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
      summary: 'Upload a KYC document',
      description:
        'Uploads a KYC document (multipart/form-data: `documentType`, `file`). The file is stored in private object storage managed by the attachments module; only the applicant and an admin reviewer can read it back.',
      tags: [dealerTag],
      responses: [{ status: 201, description: 'Document uploaded', schema: documentUploadResponseSchema }],
      errors: [{ status: 401, description: 'Authentication required' }, { status: 400, description: 'Cannot upload in current status' }, ...commonDealerErrors()],
    },
  },
}
