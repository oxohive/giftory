import { z } from 'zod'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { conflict } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { DealerProfile } from '../data/entities'
import { dealerRegisterSchema } from '../data/validators'
import { DEALER_REGISTER_COMMAND, DEALER_OWNER_ROLE } from '../lib/constants'
import { executeOmCommand } from './shared'

const systemScopeSchema = z.object({
  tenantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
})

const registerCommandSchema = dealerRegisterSchema.merge(systemScopeSchema)

export type SerializedDealerProfile = {
  id: string
  organizationId: string
  tenantId: string
  businessName: string
  contactEmail: string
  phone: string
  businessType: string
  city: string
  state: string
  pincode: string
  kycStatus: string
  rejectionReason: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  approvedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export function serializeDealerProfile(p: DealerProfile): SerializedDealerProfile {
  return {
    id: String(p.id),
    organizationId: String(p.organizationId),
    tenantId: String(p.tenantId),
    businessName: p.businessName,
    contactEmail: p.contactEmail,
    phone: p.phone,
    businessType: p.businessType,
    city: p.city,
    state: p.state,
    pincode: p.pincode,
    kycStatus: p.kycStatus,
    rejectionReason: p.rejectionReason ?? null,
    reviewedBy: p.reviewedBy ?? null,
    reviewedAt: p.reviewedAt ? p.reviewedAt.toISOString() : null,
    approvedAt: p.approvedAt ? p.approvedAt.toISOString() : null,
    createdAt: p.createdAt ? p.createdAt.toISOString() : null,
    updatedAt: p.updatedAt ? p.updatedAt.toISOString() : null,
  }
}

const registerDealerCommand: CommandHandler<Record<string, unknown>, { profile: DealerProfile; organizationId: string }> = {
  id: DEALER_REGISTER_COMMAND,
  async execute(rawInput, ctx) {
    const parsed = registerCommandSchema.parse(rawInput)
    const { translate } = await resolveTranslations()
    const em = ctx.container.resolve<EntityManager>('em')
    const de = ctx.container.resolve<DataEngine>('dataEngine')

    // Derive tenant from auth context (HTTP routes strip payload scope).
    const tenantId = ctx.auth?.tenantId ?? (ctx.systemActor === true ? parsed.tenantId : null) ?? null
    if (!tenantId) throw new Error('[internal] dealer register command requires tenant scope')

    // Reject duplicate email registrations for this tenant.
    const existingByEmail = await em.findOne(DealerProfile, {
      contactEmail: parsed.contactEmail,
      tenantId,
      deletedAt: null,
    } as FilterQuery<DealerProfile>)
    if (existingByEmail) {
      throw conflict(translate('dealer_onboarding.errors.emailAlreadyRegistered', 'A dealer application with this email already exists'))
    }

    // Create an OM organization for the dealer (directory.organizations.create).
    const { id: organizationId } = await executeOmCommand<{ id: string }>(
      ctx.container,
      'directory.organizations.create',
      { tenantId, name: parsed.businessName, isActive: false },
      { ...ctx, auth: { ...ctx.auth, tenantId, isSuperAdmin: true, sub: 'system' } as typeof ctx.auth, systemActor: true },
    )

    // Create the dealer profile linked to the new org.
    const profile = await de.createOrmEntity({
      entity: DealerProfile,
      data: {
        organizationId,
        tenantId,
        businessName: parsed.businessName,
        contactEmail: parsed.contactEmail,
        phone: parsed.phone,
        gstin: parsed.gstin,
        pan: parsed.pan,
        businessType: parsed.businessType,
        city: parsed.city,
        state: parsed.state,
        pincode: parsed.pincode,
        kycStatus: 'pending_verification',
      },
    })

    // Create the dealer owner user and send an invite/verification email.
    await executeOmCommand(
      ctx.container,
      'auth.users.create',
      {
        email: parsed.contactEmail,
        organizationId,
        roles: [DEALER_OWNER_ROLE],
        sendInviteEmail: true,
      },
      { ...ctx, auth: { ...ctx.auth, tenantId, isSuperAdmin: true, sub: 'system' } as typeof ctx.auth, systemActor: true },
    )

    return { profile, organizationId }
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    const { profile } = result
    return {
      actionLabel: translate('dealer_onboarding.audit.register', 'Dealer registration submitted'),
      resourceKind: 'dealer_onboarding.dealer_profile',
      resourceId: String(profile.id),
      tenantId: String(profile.tenantId),
      organizationId: String(profile.organizationId),
      snapshotAfter: serializeDealerProfile(profile),
    }
  },
}

registerCommand(registerDealerCommand)
