import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'payouts',
  title: 'Payout Ledger',
  version: '0.1.0',
  requires: ['commissions'],
}
