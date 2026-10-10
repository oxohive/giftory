import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { FilterQuery } from '@mikro-orm/postgresql'
import { DEALER_OWNER_ROLE, DEALER_STAFF_ROLE } from './lib/constants'

const logger = createLogger('dealer_onboarding').child({ component: 'setup' })

/**
 * Create dealer roles if they don't yet exist for this tenant.
 * The roles are org-scope-restricted at dealer approval time via `auth.role-acl.update`
 * (see the approve command). Until then, they carry only the onboarding feature grants.
 */
async function ensureDealerRoles(em: import('@mikro-orm/postgresql').EntityManager, tenantId: string): Promise<void> {
  const { Role } = await import('@open-mercato/core/modules/auth/data/entities')
  for (const roleName of [DEALER_OWNER_ROLE, DEALER_STAFF_ROLE]) {
    const existing = await em.findOne(Role, {
      name: roleName,
      tenantId,
      deletedAt: null,
    } as FilterQuery<typeof Role.prototype>)
    if (!existing) {
      em.create(Role, { name: roleName, tenantId })
      logger.debug('Creating dealer role', { tenantId, roleName })
    }
  }
  await em.flush()
}

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['dealer_onboarding.admin'],
    admin: ['dealer_onboarding.admin'],
    [DEALER_OWNER_ROLE]: ['dealer_onboarding.view_own', 'dealer_onboarding.submit'],
    [DEALER_STAFF_ROLE]: ['dealer_onboarding.view_own'],
  },

  async onTenantCreated({ em, tenantId }) {
    await ensureDealerRoles(em, tenantId)
  },

  async seedDefaults({ em, tenantId }) {
    await ensureDealerRoles(em, tenantId)
  },
}

export default setup
