import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { DEALER_OWNER_ROLE } from './lib/constants'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['commissions.*'],
    admin: ['commissions.view', 'commissions.manage'],
    employee: ['commissions.view'],
    // FEAT-009: commission data is owner-only — staff cannot access it.
    // Applied at tenant creation and via `yarn mercato auth sync-role-acls`;
    // additionally re-asserted (merge-safe) on every dealer approval — see
    // dealer_onboarding/commands/review.ts.
    [DEALER_OWNER_ROLE]: ['commissions.dealer_access'],
  },
}

export default setup
