import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['payouts.*'],
    admin: ['payouts.view', 'payouts.manage'],
    employee: ['payouts.view'],
  },
}

export default setup
