export const metadata = {
  requireAuth: true,
  requireFeatures: ['commissions.manage'],
  pageTitle: 'Create commission rule',
  pageTitleKey: 'commissions.admin.rules.form.create.title',
  navHidden: true,
  breadcrumb: [
    { label: 'Commission rules', labelKey: 'commissions.admin.rules.page.title', href: '/backend/commission-rules' },
    { label: 'Create', labelKey: 'commissions.admin.rules.form.create.title' },
  ],
}
