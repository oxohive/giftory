import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandHandler, CommandBus } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { badRequest } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { staffInviteSchema } from '../data/validators'
import { DEALER_STAFF_INVITE_COMMAND, DEALER_STAFF_ROLE } from '../lib/constants'
import { findOwnProfile } from './shared'

const commandInputSchema = staffInviteSchema.extend({
  organizationId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
})

const command: CommandHandler<Record<string, unknown>, { userId: string; email: string }> = {
  id: DEALER_STAFF_INVITE_COMMAND,
  async execute(rawInput, ctx) {
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

    const { result } = await commandBus.execute<Record<string, unknown>, { id: string }>('auth.users.create', {
      input: {
        email: parsed.email,
        name: parsed.name,
        organizationId: orgId,
        roles: [DEALER_STAFF_ROLE],
        sendInviteEmail: true,
        tenantId,
      },
      ctx: systemCtx,
    })

    return { userId: result.id, email: parsed.email }
  },
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
