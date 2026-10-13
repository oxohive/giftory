import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { DEALER_OWNER_ROLE, DEALER_STAFF_ROLE } from './lib/constants'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['dealer_orders.*'],
    admin: ['dealer_orders.view', 'dealer_orders.manage'],
    employee: ['dealer_orders.view'],
    // FEAT-009: both the dealer owner and their staff can view and update
    // their assigned orders. Applied at tenant creation and via
    // `yarn mercato auth sync-role-acls`; the owner's grant is additionally
    // re-asserted (merge-safe) on every dealer approval — see
    // dealer_onboarding/commands/review.ts.
    [DEALER_OWNER_ROLE]: ['dealer_orders.dealer_access'],
    [DEALER_STAFF_ROLE]: ['dealer_orders.dealer_access'],
  },
}

export default setup
