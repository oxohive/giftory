import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['dealer_orders.*'],
    admin: ['dealer_orders.view', 'dealer_orders.manage'],
    employee: ['dealer_orders.view'],
  },
}

export default setup
