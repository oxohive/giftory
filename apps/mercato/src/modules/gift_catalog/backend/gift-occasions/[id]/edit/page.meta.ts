export const metadata = {
  requireAuth: true,
  requireFeatures: ['gift_catalog.manage'],
  pageTitle: 'Edit gift occasion',
  pageTitleKey: 'gift_catalog.occasions.form.edit.title',
  pageGroup: 'Catalog',
  pageGroupKey: 'catalog.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Gift occasions', labelKey: 'gift_catalog.occasions.page.title', href: '/backend/gift-occasions' },
    { label: 'Edit', labelKey: 'gift_catalog.occasions.form.edit.title' },
  ],
}
