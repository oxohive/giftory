export const metadata = {
  requireAuth: true,
  requireFeatures: ['dealer_org.admin'],
  pageTitle: 'Dealer detail',
  pageTitleKey: 'dealer_org_rbac.admin.detail.title',
  // Reached from this module's own directory (/backend/dealers), never
  // listed on its own in the sidebar.
  navHidden: true,
  breadcrumb: [
    { label: 'Dealers', labelKey: 'dealer_org_rbac.admin.directory.title', href: '/backend/dealers' },
    { label: 'Dealer detail', labelKey: 'dealer_org_rbac.admin.detail.title' },
  ],
}
