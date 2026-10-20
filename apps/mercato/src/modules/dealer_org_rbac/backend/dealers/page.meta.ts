export const metadata = {
  requireAuth: true,
  requireFeatures: ['dealer_org.admin'],
  pageTitle: 'Dealers',
  pageTitleKey: 'dealer_org_rbac.admin.directory.title',
  // Grouped alongside `commissions`/`payouts`'s existing "Dealers" sidebar
  // group (per CONTRACT-HANDOFF.md's Navigation entries section, this
  // module's own sidebar entry is titled "Dealers" and is the directory
  // other dealer-finance screens link out of) — ordered first in that
  // group since it's the entry point into a specific dealer.
  pageGroup: 'Dealers',
  pageGroupKey: 'dealer_org_rbac.admin.nav.group',
  pageOrder: 100,
  icon: 'store',
  breadcrumb: [
    { label: 'Dealers', labelKey: 'dealer_org_rbac.admin.directory.title' },
  ],
}
