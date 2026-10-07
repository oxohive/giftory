export const metadata = {
  requireAuth: true,
  requireFeatures: ['gift_catalog.manage'],
  pageTitle: 'Create gift occasion',
  pageTitleKey: 'gift_catalog.occasions.form.create.title',
  pageGroup: 'Catalog',
  pageGroupKey: 'catalog.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Gift occasions', labelKey: 'gift_catalog.occasions.page.title', href: '/backend/gift-occasions' },
    { label: 'Create', labelKey: 'gift_catalog.occasions.form.create.title' },
  ],
}
