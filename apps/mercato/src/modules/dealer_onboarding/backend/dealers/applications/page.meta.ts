export const metadata = {
  requireAuth: true,
  requireFeatures: ['dealer_onboarding.admin'],
  pageTitle: 'Dealer applications',
  pageTitleKey: 'dealer_onboarding.admin.title',
  // Own top-level sidebar entry (CONTRACT-HANDOFF.md: "dealer_onboarding ->
  // 'Dealer Applications'") — distinct from dealer_org_rbac's "Dealers"
  // directory group, since KYC review is a queue of pending work items, not
  // part of the approved-dealer directory.
  pageGroup: 'Dealer Applications',
  pageGroupKey: 'dealer_onboarding.admin.nav.group',
  pageOrder: 130,
  icon: 'file-check',
  breadcrumb: [
    { label: 'Dealer applications', labelKey: 'dealer_onboarding.admin.title' },
  ],
}
