import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandHandler, CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { badRequest, notFound } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { staffInviteSchema, staffDeactivateSchema } from '../data/validators'
import { DEALER_STAFF_INVITE_COMMAND, DEALER_STAFF_DEACTIVATE_COMMAND, DEALER_STAFF_ROLE } from '../lib/constants'
import { findOwnProfile } from './shared'
import { findDealerStaffUser } from '../lib/staffDirectory'

const commandInputSchema = staffInviteSchema.extend({
  organizationId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
})

export async function executeStaffInvite(
  rawInput: unknown,
  ctx: CommandRuntimeContext,
): Promise<{ userId: string; email: string }> {
  const parsed = commandInputSchema.parse(rawInput)
  const { translate } = await resolveTranslations()

  const tenantId = ctx.auth?.tenantId ?? parsed.tenantId ?? null
  if (!tenantId) throw badRequest(translate('dealer_org.errors.missingTenantScope', 'Missing tenant scope'))

  const orgId = ctx.auth?.orgId ?? parsed.organizationId ?? null
  if (!orgId) throw badRequest(translate('dealer_org.errors.missingOrgScope', 'Missing organization scope'))

  const em = ctx.container.resolve<EntityManager>('em')

  // Verify caller is an approved dealer with this org.
  await findOwnProfile(em, orgId, tenantId)

  // Create the invited user via OM auth command, assigning dealer:staff role.
  const commandBus = ctx.container.resolve<CommandBus>('commandBus')
  const systemCtx = {
    ...ctx,
    auth: { ...ctx.auth, tenantId, isSuperAdmin: true, sub: 'system' } as typeof ctx.auth,
    systemActor: true,
  }

  // `auth.users.create` returns `{ user, warning }` (@open-mercato/core's
  // `commands/users.ts`), not a flat `{ id }` — the generic type param
  // below previously claimed `{ id: string }`, which TypeScript trusted
  // without checking against the real command's actual return type, so
  // `result.id` silently resolved to `undefined` at runtime on every
  // invite. Confirmed by reading the real command source directly.
  const { result } = await commandBus.execute<Record<string, unknown>, { user: { id: string }; warning?: string }>(
    'auth.users.create',
    {
      input: {
        email: parsed.email,
        name: parsed.name,
        organizationId: orgId,
        roles: [DEALER_STAFF_ROLE],
        sendInviteEmail: true,
        tenantId,
      },
      ctx: systemCtx,
    },
  )

  return { userId: result.user.id, email: parsed.email }
}

const command: CommandHandler<Record<string, unknown>, { userId: string; email: string }> = {
  id: DEALER_STAFF_INVITE_COMMAND,
  execute: executeStaffInvite,
  buildLog: async ({ input, result }) => {
    const { translate } = await resolveTranslations()
    const inp = input as Record<string, unknown>
    return {
      actionLabel: translate('dealer_org.audit.inviteStaff', 'Invite dealer staff user'),
      resourceKind: 'dealer_org_rbac.staff_invite',
      resourceId: String((result as { userId?: string }).userId ?? ''),
      tenantId: String(inp.tenantId ?? ''),
      organizationId: String(inp.organizationId ?? ''),
      snapshotAfter: { email: inp.email },
    }
  },
}

registerCommand(command)

const deactivateCommandInputSchema = staffDeactivateSchema.extend({
  organizationId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
})

/**
 * Deactivates a dealer:staff user using the INSTALLED auth module's own
 * `auth.users.update` command — never a hand-rolled "active" flag. Setting
 * `isConfirmed: false` is the real revocation mechanism: the auth module's
 * `resolveCanonicalStaffAuthContext` (session-integrity check, re-run on
 * every authenticated request) rejects the user the moment `isConfirmed`
 * is false, and `api/login.ts` refuses a fresh login with
 * `account_deactivated` — so this is not a flag nothing checks.
 *
 * Fails closed in two independent ways before ever calling the auth
 * command:
 *  1. An owner can never deactivate themselves (`userId === ctx.auth.sub`)
 *     — checked unconditionally, regardless of role, as the task's explicit
 *     "owner cannot self-deactivate" requirement.
 *  2. The target must resolve as a `dealer:staff` member of the CALLER'S OWN
 *     org (via `findDealerStaffUser`, scoped by the caller's session
 *     tenant+org) — a different org's user id, or a `dealer:owner`'s id,
 *     never resolves, so this can never be used to deactivate another
 *     dealer's staff or any owner.
 */
export async function executeStaffDeactivate(
  rawInput: unknown,
  ctx: CommandRuntimeContext,
): Promise<{ userId: string; deactivated: true }> {
  const parsed = deactivateCommandInputSchema.parse(rawInput)
  const { translate } = await resolveTranslations()

  const tenantId = ctx.auth?.tenantId ?? parsed.tenantId ?? null
  if (!tenantId) throw badRequest(translate('dealer_org.errors.missingTenantScope', 'Missing tenant scope'))

  const orgId = ctx.auth?.orgId ?? parsed.organizationId ?? null
  if (!orgId) throw badRequest(translate('dealer_org.errors.missingOrgScope', 'Missing organization scope'))

  const callerUserId = ctx.auth?.sub ? String(ctx.auth.sub) : null
  if (callerUserId && callerUserId === parsed.userId) {
    throw badRequest(translate('dealer_org.errors.cannotDeactivateSelf', 'An owner cannot deactivate their own account'))
  }

  const em = ctx.container.resolve<EntityManager>('em')

  // Verify the caller is an approved dealer owner of this org.
  await findOwnProfile(em, orgId, tenantId)

  // Resolve the target as a dealer:staff member of THIS org — fails closed
  // (404) for any other org's user, any dealer:owner, or an unknown id.
  const target = await findDealerStaffUser(em, orgId, tenantId, parsed.userId)
  if (!target) {
    throw notFound(translate('dealer_org.errors.staffNotFound', 'Staff user not found'))
  }

  const commandBus = ctx.container.resolve<CommandBus>('commandBus')
  const systemCtx = {
    ...ctx,
    auth: { ...ctx.auth, tenantId, isSuperAdmin: true, sub: 'system' } as typeof ctx.auth,
    systemActor: true,
  }
  await commandBus.execute('auth.users.update', {
    input: { id: parsed.userId, isConfirmed: false },
    ctx: systemCtx,
  })

  return { userId: parsed.userId, deactivated: true }
}

const deactivateCommand: CommandHandler<Record<string, unknown>, { userId: string; deactivated: true }> = {
  id: DEALER_STAFF_DEACTIVATE_COMMAND,
  execute: executeStaffDeactivate,
  buildLog: async ({ input, result }) => {
    const { translate } = await resolveTranslations()
    const inp = input as Record<string, unknown>
    return {
      actionLabel: translate('dealer_org.audit.deactivateStaff', 'Deactivate dealer staff user'),
      resourceKind: 'dealer_org_rbac.staff_deactivate',
      resourceId: String(result.userId),
      tenantId: String(inp.tenantId ?? ''),
      organizationId: String(inp.organizationId ?? ''),
      snapshotAfter: { userId: result.userId, isConfirmed: false },
    }
  },
}

registerCommand(deactivateCommand)
