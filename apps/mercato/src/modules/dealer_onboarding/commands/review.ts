import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { badRequest } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { DealerProfile } from '../data/entities'
import { DEALER_APPROVE_COMMAND, DEALER_REJECT_COMMAND } from '../lib/constants'
import { resolveCommandScope } from '../lib/scope'
import { findProfileById, serializeDealerProfile, executeOmCommand } from './shared'
import type { SerializedDealerProfile } from './register'
import eventsConfig from '../events'

const approveSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
})

const rejectSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(1).max(2000),
  tenantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
})

export async function executeApprove(rawInput: unknown, ctx: CommandRuntimeContext): Promise<DealerProfile> {
  const parsed = approveSchema.parse(rawInput)
  const scope = resolveCommandScope(ctx, parsed)
  const { translate } = await resolveTranslations()
  const em = ctx.container.resolve<EntityManager>('em')

  const profile = await findProfileById(em, parsed.id, scope.tenantId)

  if (profile.kycStatus === 'approved') {
    throw badRequest(translate('dealer_onboarding.errors.alreadyApproved', 'This dealer is already approved'))
  }
  if (profile.kycStatus !== 'under_review') {
    throw badRequest(
      translate('dealer_onboarding.errors.cannotApproveInStatus', 'Only applications under review can be approved'),
    )
  }

  // Activate the OM organization.
  await executeOmCommand(
    ctx.container,
    'directory.organizations.update',
    { id: profile.organizationId, tenantId: scope.tenantId, isActive: true },
    { ...ctx, auth: { ...ctx.auth, tenantId: scope.tenantId, isSuperAdmin: true, sub: 'system' } as typeof ctx.auth, systemActor: true },
  )

  const reviewerId = ctx.auth?.sub ?? null
  profile.kycStatus = 'approved'
  profile.reviewedBy = reviewerId
  profile.reviewedAt = new Date()
  profile.approvedAt = new Date()
  profile.rejectionReason = null
  profile.updatedAt = new Date()
  await em.flush()

  // Notifies the dealer by email (see `subscribers/notify-dealer-on-approval.ts`)
  // that they can now log in. Persistent — retried on failure, not swallowed.
  await eventsConfig.emit('dealer_onboarding.profile.approved', {
    id: profile.id,
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    contactEmail: profile.contactEmail,
  })

  return profile
}

const approveCommand: CommandHandler<Record<string, unknown>, DealerProfile> = {
  id: DEALER_APPROVE_COMMAND,
  execute: executeApprove,
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('dealer_onboarding.audit.approved', 'Dealer application approved'),
      resourceKind: 'dealer_onboarding.dealer_profile',
      resourceId: String(result.id),
      tenantId: String(result.tenantId),
      organizationId: String(result.organizationId),
      snapshotAfter: serializeDealerProfile(result),
    }
  },
}

export async function executeReject(rawInput: unknown, ctx: CommandRuntimeContext): Promise<DealerProfile> {
  const parsed = rejectSchema.parse(rawInput)
  const scope = resolveCommandScope(ctx, parsed)
  const { translate } = await resolveTranslations()
  const em = ctx.container.resolve<EntityManager>('em')

  const profile = await findProfileById(em, parsed.id, scope.tenantId)

  if (profile.kycStatus === 'rejected') {
    throw badRequest(translate('dealer_onboarding.errors.alreadyRejected', 'This dealer is already rejected'))
  }
  if (profile.kycStatus === 'approved') {
    throw badRequest(translate('dealer_onboarding.errors.cannotRejectApproved', 'An approved dealer cannot be rejected'))
  }

  const reviewerId = ctx.auth?.sub ?? null
  profile.kycStatus = 'rejected'
  profile.rejectionReason = parsed.reason
  profile.reviewedBy = reviewerId
  profile.reviewedAt = new Date()
  profile.updatedAt = new Date()
  await em.flush()

  // Notifies the dealer by email (see `subscribers/notify-dealer-on-rejection.ts`)
  // with the reason and a link to log in and resubmit.
  await eventsConfig.emit('dealer_onboarding.profile.rejected', {
    id: profile.id,
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    contactEmail: profile.contactEmail,
    reason: parsed.reason,
  })

  return profile
}

const rejectCommand: CommandHandler<Record<string, unknown>, DealerProfile> = {
  id: DEALER_REJECT_COMMAND,
  execute: executeReject,
  buildLog: async ({ result, input }) => {
    const { translate } = await resolveTranslations()
    const snap = serializeDealerProfile(result)
    return {
      actionLabel: translate('dealer_onboarding.audit.rejected', 'Dealer application rejected'),
      resourceKind: 'dealer_onboarding.dealer_profile',
      resourceId: String(result.id),
      tenantId: String(result.tenantId),
      organizationId: String(result.organizationId),
      snapshotAfter: { ...snap, rejectionReason: (input as Record<string, unknown>).reason as string },
    }
  },
}

registerCommand(approveCommand)
registerCommand(rejectCommand)
