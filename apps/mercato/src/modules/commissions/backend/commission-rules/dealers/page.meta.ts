export const metadata = {
  requireAuth: true,
  requireFeatures: ['commissions.view'],
  pageTitle: 'Dealer commission history',
  pageTitleKey: 'commissions.admin.dealerHistory.picker.title',
  // Reached from the "Commission rules" page's "Dealer commission history"
  // action, never listed on its own in the sidebar.
  navHidden: true,
  breadcrumb: [
    { label: 'Commission rules', labelKey: 'commissions.admin.rules.page.title', href: '/backend/commission-rules' },
    { label: 'Dealer commission history', labelKey: 'commissions.admin.dealerHistory.picker.title' },
  ],
}
