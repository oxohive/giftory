import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['commissions.*'],
    admin: ['commissions.view', 'commissions.manage'],
    employee: ['commissions.view'],
  },
}

export default setup
