export const features = [
  {
    id: 'payouts.view',
    title: 'View payout ledger',
    module: 'payouts',
  },
  {
    id: 'payouts.manage',
    title: 'Manage payouts — record disbursements and adjustments',
    module: 'payouts',
  },
  {
    id: 'payouts.dealer_access',
    title: 'Dealer: view own ledger and balance',
    module: 'payouts',
  },
]

// The generated module registry (`.mercato/generated/modules.runtime.generated.ts`)
// imports every module's `acl.ts` as a namespace and reads `.default` off it — every
// other Phase 2 module (dealer_onboarding, dealer_org_rbac, dealer_orders, commissions)
// re-exports `features` as the default export for exactly this reason. This module was
// missing it, which compiles fine under `next dev` (lazily resolved) but makes a real
// production build (`next build` — used by this repo's CI/CD and by the ephemeral
// integration-test harness) fail outright: "The export default was not found in module
// .../payouts/acl.ts" — confirmed by actually running `yarn mercato test:ephemeral`,
// which performs a real production build before serving the app.
export default features
