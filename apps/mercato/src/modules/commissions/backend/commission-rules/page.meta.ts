export const metadata = {
  requireAuth: true,
  requireFeatures: ['commissions.view'],
  pageTitle: 'Commission rules',
  pageTitleKey: 'commissions.admin.rules.page.title',
  // Grouped alongside `payouts`'s existing "Dealers" sidebar group
  // (src/modules/payouts/backend/dealers/page.meta.ts) — both modules'
  // admin screens are per-dealer finance tooling.
  pageGroup: 'Dealers',
  pageGroupKey: 'commissions.admin.nav.group',
  pageOrder: 150,
  icon: 'percent',
  breadcrumb: [
    { label: 'Commission rules', labelKey: 'commissions.admin.rules.page.title' },
  ],
}
