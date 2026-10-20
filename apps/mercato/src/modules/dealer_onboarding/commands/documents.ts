import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { badRequest, notFound } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { DealerKycDocument, DealerProfile } from '../data/entities'
import { dealerDocumentUploadSchema, DEALER_DOCUMENT_MIME_PATTERN } from '../data/validators'
import {
  DEALER_UPLOAD_DOCUMENT_COMMAND,
  DEALER_DOCUMENT_ENTITY_ID,
  DEALER_DOCUMENT_ATTACHMENT_PARTITION,
  MAX_DOCUMENT_SIZE_BYTES,
} from '../lib/constants'
import { resolveCommandScope } from '../lib/scope'

const systemScopeSchema = z.object({
  tenantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
})
const uploadCommandSchema = dealerDocumentUploadSchema.merge(systemScopeSchema)

export type SerializedDealerDocument = {
  id: string
  dealerProfileId: string
  tenantId: string
  documentType: string
  storageKey: string
  fileName: string
  fileSizeBytes: number
  mimeType: string
  uploadedAt: string | null
}

export function serializeDealerDocument(doc: DealerKycDocument): SerializedDealerDocument {
  return {
    id: String(doc.id),
    dealerProfileId: String(doc.dealerProfileId),
    tenantId: String(doc.tenantId),
    documentType: doc.documentType,
    storageKey: doc.storageKey,
    fileName: doc.fileName,
    fileSizeBytes: doc.fileSizeBytes,
    mimeType: doc.mimeType,
    uploadedAt: doc.uploadedAt ? doc.uploadedAt.toISOString() : null,
  }
}

/**
 * Uploads a KYC document's real bytes to private, access-controlled object
 * storage via the attachments module's `attachmentService.createScoped`, then
 * persists a `DealerKycDocument` row pointing at the resulting attachment id
 * (`storageKey`). This is a genuine file transport — the stored `fileName`,
 * `mimeType`, and `fileSizeBytes` all come from the actually-uploaded bytes
 * (sniffed/measured by the attachments module), never from client-declared
 * values. The attachment is scoped to this dealer's tenant+organization and
 * is unreachable without a session matching that scope (see the dedicated
 * dealer/admin download routes, which additionally require the caller's own
 * profile — dealer side — or the `dealer_onboarding.admin` feature — admin
 * side — before reading it back).
 */
export async function executeUploadDocument(rawInput: unknown, ctx: CommandRuntimeContext): Promise<DealerKycDocument> {
  const parsed = uploadCommandSchema.parse(rawInput)
  const scope = resolveCommandScope(ctx, parsed)
  const { translate } = await resolveTranslations()
  const em = ctx.container.resolve<EntityManager>('em')
  const de = ctx.container.resolve<DataEngine>('dataEngine')
  const attachmentService = ctx.container.resolve<AttachmentService>('attachmentService')

  // Verify the dealer profile belongs to this org and is in an uploadable state.
  const profile = await em.findOne(DealerProfile, {
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    deletedAt: null,
  })
  if (!profile) throw notFound(translate('dealer_onboarding.errors.profileNotFound', 'Dealer profile not found'))

  if (profile.kycStatus !== 'pending_verification' && profile.kycStatus !== 'under_review') {
    throw badRequest(
      translate('dealer_onboarding.errors.cannotUploadInStatus', 'Documents can only be uploaded while the application is pending or under review'),
    )
  }

  // Cheap pre-checks before spending storage: size and declared mime type.
  if (parsed.buffer.length > MAX_DOCUMENT_SIZE_BYTES) {
    throw badRequest(translate('dealer_onboarding.validation.fileTooLarge', 'File exceeds the maximum upload size of 10 MB'))
  }
  if (parsed.declaredMimeType && !DEALER_DOCUMENT_MIME_PATTERN.test(parsed.declaredMimeType)) {
    throw badRequest(
      translate('dealer_onboarding.validation.unsupportedMimeType', 'Unsupported file type. Use PDF, JPEG, PNG, WEBP or TIFF.'),
    )
  }

  const uploaded = await attachmentService.createScoped({
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    entityId: DEALER_DOCUMENT_ENTITY_ID,
    recordId: profile.id,
    partitionCode: DEALER_DOCUMENT_ATTACHMENT_PARTITION,
    fileName: parsed.fileName,
    declaredMimeType: parsed.declaredMimeType,
    buffer: parsed.buffer,
  })

  // Defense in depth: re-check the *actually sniffed* mime type the
  // attachments module stored, in case a client lied about Content-Type for
  // a file whose magic bytes still resolved to something attachments allows
  // generally but this KYC flow does not.
  if (!DEALER_DOCUMENT_MIME_PATTERN.test(uploaded.mimeType)) {
    await attachmentService.releaseScoped?.({
      attachmentId: uploaded.id,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      expectedOwner: { entityId: DEALER_DOCUMENT_ENTITY_ID, recordId: profile.id },
      expectedAssignment: { type: DEALER_DOCUMENT_ENTITY_ID, id: profile.id },
    }).catch(() => undefined)
    throw badRequest(
      translate('dealer_onboarding.validation.unsupportedMimeType', 'Unsupported file type. Use PDF, JPEG, PNG, WEBP or TIFF.'),
    )
  }

  // Soft-delete any existing document of the same type so only one active copy per type exists.
  const existing = await em.findOne(DealerKycDocument, {
    dealerProfileId: profile.id,
    documentType: parsed.documentType,
    deletedAt: null,
  })
  if (existing) {
    existing.deletedAt = new Date()
    await em.flush()
  }

  const document = await de.createOrmEntity({
    entity: DealerKycDocument,
    data: {
      dealerProfileId: profile.id,
      tenantId: scope.tenantId,
      documentType: parsed.documentType,
      storageKey: uploaded.id,
      fileName: uploaded.fileName,
      fileSizeBytes: uploaded.fileSize,
      mimeType: uploaded.mimeType,
    },
  })

  // Advance to under_review once documents start arriving.
  if (profile.kycStatus === 'pending_verification') {
    profile.kycStatus = 'under_review'
    await em.flush()
  }

  return document
}

const uploadDocumentCommand: CommandHandler<Record<string, unknown>, DealerKycDocument> = {
  id: DEALER_UPLOAD_DOCUMENT_COMMAND,
  execute: executeUploadDocument,
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('dealer_onboarding.audit.documentUploaded', 'Dealer KYC document uploaded'),
      resourceKind: 'dealer_onboarding.dealer_kyc_document',
      resourceId: String(result.id),
      tenantId: String(result.tenantId),
      organizationId: String(result.dealerProfileId),
      snapshotAfter: serializeDealerDocument(result),
    }
  },
}

registerCommand(uploadDocumentCommand)
