import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { ensureDefaultGiftOccasions } from './lib/seeds'

const logger = createLogger('gift_catalog').child({ component: 'setup' })

/**
 * - `onTenantCreated` fires for every new tenant (including ones created after
 *   `mercato init`) and seeds the default occasion lookup for its organization.
 * - `seedDefaults` runs on `mercato init` / `mercato seed:defaults` and backfills
 *   the same rows for organizations that existed before this module was enabled.
 *
 * Both are idempotent (existing codes, including soft-deleted ones, are kept).
 * Demo products are NOT seeded here; use `yarn mercato gift_catalog seed-demo`.
 */
export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['gift_catalog.*'],
    admin: ['gift_catalog.*'],
    employee: ['gift_catalog.view'],
  },

  async onTenantCreated({ em, tenantId, organizationId }) {
    const inserted = await ensureDefaultGiftOccasions(em, { tenantId, organizationId })
    if (inserted > 0) logger.info('Seeded default gift occasions', { tenantId, organizationId, inserted })
  },

  async seedDefaults({ em, tenantId, organizationId }) {
    const inserted = await ensureDefaultGiftOccasions(em, { tenantId, organizationId })
    if (inserted > 0) logger.info('Seeded default gift occasions', { tenantId, organizationId, inserted })
  },
}

export default setup
