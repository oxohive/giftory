import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import {
  DEALER_OWNER_ROLE,
  DEALER_STAFF_ROLE,
  FEAT_DEALER_ORG_ADMIN,
  FEAT_DEALER_ORG_VIEW,
  FEAT_DEALER_ORG_MANAGE_CAPABILITIES,
  FEAT_DEALER_ORG_MANAGE_STAFF,
} from './lib/constants'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: [FEAT_DEALER_ORG_ADMIN],
    admin: [FEAT_DEALER_ORG_ADMIN],
    [DEALER_OWNER_ROLE]: [
      FEAT_DEALER_ORG_VIEW,
      FEAT_DEALER_ORG_MANAGE_CAPABILITIES,
      FEAT_DEALER_ORG_MANAGE_STAFF,
    ],
    [DEALER_STAFF_ROLE]: [FEAT_DEALER_ORG_VIEW],
  },
}

export default setup
