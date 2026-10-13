export const metadata = {
  requireAuth: true,
  requireFeatures: ['dealer_onboarding.admin'],
  pageTitle: 'Dealer application review',
  pageTitleKey: 'dealer_onboarding.admin.detail.page.title',
  // Reached only from the applications list/row action — never listed on
  // its own in the sidebar.
  navHidden: true,
  breadcrumb: [
    { label: 'Dealer applications', labelKey: 'dealer_onboarding.admin.title', href: '/backend/dealers/applications' },
    { label: 'Review', labelKey: 'dealer_onboarding.admin.detail.page.title' },
  ],
}
