import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'dealer_org_rbac',
  title: 'Dealer Organization & RBAC',
  version: '0.1.0',
  description:
    'Dealer production capability configuration (product types, printing methods, capacity, serviceable states) and staff user management. Extends the FEAT-008 dealer profile with org-scoped role grants and a capability upsert command.',
  author: 'Gift Marketplace',
  license: 'Proprietary',
  requires: ['auth', 'directory', 'dealer_onboarding'],
}
