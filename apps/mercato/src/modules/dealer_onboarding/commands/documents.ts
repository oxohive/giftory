import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { badRequest, notFound } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { DealerKycDocument, DealerProfile } from '../data/entities'
import { dealerDocumentUploadSchema } from '../data/validators'
import { DEALER_UPLOAD_DOCUMENT_COMMAND } from '../lib/constants'
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

const uploadDocumentCommand: CommandHandler<Record<string, unknown>, DealerKycDocument> = {
  id: DEALER_UPLOAD_DOCUMENT_COMMAND,
  async execute(rawInput, ctx) {
    const parsed = uploadCommandSchema.parse(rawInput)
    const scope = resolveCommandScope(ctx, parsed)
    const { translate } = await resolveTranslations()
    const em = ctx.container.resolve<EntityManager>('em')
    const de = ctx.container.resolve<DataEngine>('dataEngine')

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
        storageKey: parsed.storageKey,
        fileName: parsed.fileName,
        fileSizeBytes: parsed.fileSizeBytes,
        mimeType: parsed.mimeType,
      },
    })

    // Advance to under_review once documents start arriving.
    if (profile.kycStatus === 'pending_verification') {
      profile.kycStatus = 'under_review'
      await em.flush()
    }

    return document
  },
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
