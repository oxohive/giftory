import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { badRequest } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { DealerProfile } from '../data/entities'
import {
  DEALER_APPROVE_COMMAND,
  DEALER_REJECT_COMMAND,
  DEALER_OWNER_ROLE,
  DEALER_OWNER_APPROVAL_FEATURES,
} from '../lib/constants'
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

/**
 * Scope the dealer:owner role to the given organization via auth.role-acl.update.
 * After this, the role's permissions only fire when the request is scoped to the
 * dealer's org (ADR-003).
 *
 * `dealer:owner` is a single, tenant-wide role shared by every dealer owner in
 * the tenant — `auth.role-acl.update`'s `persist` does a straight REPLACE of
 * `featuresJson`/`organizationsJson`, not a merge. Calling it with a hardcoded
 * feature list (as this used to) would silently wipe every other grant the
 * role already holds (e.g. `dealer_org.view`/`.manage_capabilities`/
 * `.manage_staff`, seeded at tenant creation) for EVERY dealer owner in the
 * tenant, and would lock out any still-pending dealer the moment their org is
 * no longer included in `organizationsJson`. To stay safe against that, this
 * function always reads the role's CURRENT `featuresJson`/`organizationsJson`
 * first and unions the required values into them — it never sends a feature
 * or organization list that could drop something already granted.
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
  const existingFeatures: string[] = Array.isArray((acl as { featuresJson?: string[] } | null)?.featuresJson)
    ? ((acl as { featuresJson: string[] }).featuresJson as string[])
    : []
  // `auth.role-acl.update`'s `persist` writes `isSuperAdmin` unconditionally from
  // its input (no fallback of its own — see @open-mercato/core's `api/roles/acl/route.ts`,
  // which always resolves `requestedIsSuperAdmin = parsed.data.isSuperAdmin ?? existingIsSuperAdmin`
  // before calling this same command). Omitting it here left it `undefined`, which MikroORM's
  // changeset diffed against the loaded `false` and wrote as a real SQL NULL — a NOT NULL
  // violation on `role_acls.is_super_admin` for every dealer:owner role that already had an ACL
  // row (i.e. every tenant with more than one approved dealer). Preserve the current value.
  const existingIsSuperAdmin = Boolean((acl as { isSuperAdmin?: boolean } | null)?.isSuperAdmin)

  const needsOrgUpdate = !existingOrgs.includes(organizationId)
  const needsFeatureUpdate = DEALER_OWNER_APPROVAL_FEATURES.some((f) => !existingFeatures.includes(f))

  if (!needsOrgUpdate && !needsFeatureUpdate) return

  await executeOmCommand(
    container,
    'auth.role-acl.update',
    {
      roleId: role.id,
      tenantId,
      isSuperAdmin: existingIsSuperAdmin,
      // Merge, never replace: keep every org already scoped in, plus this one.
      organizations: needsOrgUpdate ? [...existingOrgs, organizationId] : existingOrgs,
      // Merge, never replace: keep every feature already granted, plus the
      // ones this approval flow requires (onboarding + the three
      // *.dealer_access grants — Gap 1/2 fix).
      features: Array.from(new Set([...existingFeatures, ...DEALER_OWNER_APPROVAL_FEATURES])),
    },
    { ...ctx, auth: { ...ctx.auth, tenantId, isSuperAdmin: true, sub: 'system' } as typeof ctx.auth, systemActor: true },
  )
}

registerCommand(approveCommand)
registerCommand(rejectCommand)
