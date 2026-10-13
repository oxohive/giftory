import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { DEALER_OWNER_ROLE } from './lib/constants'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['payouts.*'],
    admin: ['payouts.view', 'payouts.manage'],
    employee: ['payouts.view'],
    // FEAT-009: payout/ledger data is owner-only — staff cannot access it.
    // Applied at tenant creation and via `yarn mercato auth sync-role-acls`;
    // additionally re-asserted (merge-safe) on every dealer approval — see
    // dealer_onboarding/commands/review.ts.
    [DEALER_OWNER_ROLE]: ['payouts.dealer_access'],
  },
}

export default setup
