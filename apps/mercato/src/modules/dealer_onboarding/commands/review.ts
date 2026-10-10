import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { badRequest } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { DealerProfile } from '../data/entities'
import { DEALER_APPROVE_COMMAND, DEALER_REJECT_COMMAND, DEALER_OWNER_ROLE } from '../lib/constants'
import { resolveCommandScope } from '../lib/scope'
import { findProfileById, serializeDealerProfile, executeOmCommand } from './shared'
import type { SerializedDealerProfile } from './register'

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

const approveCommand: CommandHandler<Record<string, unknown>, DealerProfile> = {
  id: DEALER_APPROVE_COMMAND,
  async execute(rawInput, ctx) {
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

    // Scope the dealer:owner role to this organization only.
    await scopeDealerRoleToOrg(ctx.container, scope.tenantId, profile.organizationId, ctx)

    const reviewerId = ctx.auth?.sub ?? null
    profile.kycStatus = 'approved'
    profile.reviewedBy = reviewerId
    profile.reviewedAt = new Date()
    profile.approvedAt = new Date()
    profile.rejectionReason = null
    profile.updatedAt = new Date()
    await em.flush()

    return profile
  },
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

const rejectCommand: CommandHandler<Record<string, unknown>, DealerProfile> = {
  id: DEALER_REJECT_COMMAND,
  async execute(rawInput, ctx) {
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

    return profile
  },
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

/**
 * Scope the dealer:owner role to the given organization via auth.role-acl.update.
 * After this, the role's permissions only fire when the request is scoped to the
 * dealer's org (ADR-003).
 */
async function scopeDealerRoleToOrg(
  container: import('awilix').AwilixContainer,
  tenantId: string,
  organizationId: string,
  ctx: import('@open-mercato/shared/lib/commands').CommandRuntimeContext,
): Promise<void> {
  const em = container.resolve<EntityManager>('em')
  const { Role, RoleAcl } = await import('@open-mercato/core/modules/auth/data/entities')

  const role = await em.findOne(Role, { name: DEALER_OWNER_ROLE, tenantId, deletedAt: null })
  if (!role) return

  const acl = await em.findOne(RoleAcl, { role: role.id, tenantId } as Parameters<typeof em.findOne>[1])
  const existingOrgs: string[] = Array.isArray((acl as { organizationsJson?: string[] } | null)?.organizationsJson)
    ? ((acl as { organizationsJson: string[] }).organizationsJson as string[])
    : []

  if (!existingOrgs.includes(organizationId)) {
    await executeOmCommand(
      container,
      'auth.role-acl.update',
      {
        roleId: role.id,
        tenantId,
        organizations: [...existingOrgs, organizationId],
        features: ['dealer_onboarding.view_own', 'dealer_onboarding.submit'],
      },
      { ...ctx, auth: { ...ctx.auth, tenantId, isSuperAdmin: true, sub: 'system' } as typeof ctx.auth, systemActor: true },
    )
  }
}

registerCommand(approveCommand)
registerCommand(rejectCommand)
