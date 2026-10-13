import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'dealer_onboarding',
  title: 'Dealer Onboarding & KYC',
  version: '0.1.0',
  description:
    'Dealer self-registration, KYC document submission, admin review/approve/reject flow, and dealer profile management. Creates dealer organizations via the OM directory module and scopes dealer roles at approval time.',
  author: 'Gift Marketplace',
  license: 'Proprietary',
  requires: ['auth', 'directory'],
}
