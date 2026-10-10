import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { badRequest } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { DealerProfile } from '../data/entities'
import { dealerResubmitSchema } from '../data/validators'
import { DEALER_RESUBMIT_COMMAND } from '../lib/constants'
import { resolveCommandScope } from '../lib/scope'
import { findOwnProfile, serializeDealerProfile } from './shared'

const systemScopeSchema = z.object({
  tenantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
})
const resubmitCommandSchema = dealerResubmitSchema.merge(systemScopeSchema)

const resubmitCommand: CommandHandler<Record<string, unknown>, DealerProfile> = {
  id: DEALER_RESUBMIT_COMMAND,
  async execute(rawInput, ctx) {
    const parsed = resubmitCommandSchema.parse(rawInput)
    const scope = resolveCommandScope(ctx, parsed)
    const { translate } = await resolveTranslations()
    const em = ctx.container.resolve<EntityManager>('em')

    const profile = await findOwnProfile(em, scope.organizationId, scope.tenantId)

    if (profile.kycStatus !== 'rejected') {
      throw badRequest(
        translate('dealer_onboarding.errors.cannotResubmitInStatus', 'Only rejected applications can be resubmitted'),
      )
    }

    if (parsed.businessName !== undefined) profile.businessName = parsed.businessName
    if (parsed.contactEmail !== undefined) profile.contactEmail = parsed.contactEmail
    if (parsed.phone !== undefined) profile.phone = parsed.phone
    if (parsed.gstin !== undefined) profile.gstin = parsed.gstin
    if (parsed.pan !== undefined) profile.pan = parsed.pan
    if (parsed.businessType !== undefined) profile.businessType = parsed.businessType
    if (parsed.city !== undefined) profile.city = parsed.city
    if (parsed.state !== undefined) profile.state = parsed.state
    if (parsed.pincode !== undefined) profile.pincode = parsed.pincode

    profile.kycStatus = 'under_review'
    profile.rejectionReason = null
    profile.updatedAt = new Date()
    await em.flush()

    return profile
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('dealer_onboarding.audit.resubmitted', 'Dealer application resubmitted'),
      resourceKind: 'dealer_onboarding.dealer_profile',
      resourceId: String(result.id),
      tenantId: String(result.tenantId),
      organizationId: String(result.organizationId),
      snapshotAfter: serializeDealerProfile(result),
    }
  },
}

registerCommand(resubmitCommand)
