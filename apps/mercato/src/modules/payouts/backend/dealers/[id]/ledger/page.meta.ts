export const metadata = {
  requireAuth: true,
  requireFeatures: ['payouts.view'],
  pageTitle: 'Dealer payout ledger',
  pageTitleKey: 'payouts.admin.ledger.title',
  // Reached from this module's own dealer picker (/backend/payouts), never
  // listed on its own in the sidebar — payouts are always viewed per dealer.
  // Deliberately NOT /backend/dealers — that top-level route is frozen as
  // dealer_org_rbac's admin dealer directory (CONTRACT-HANDOFF.md); this
  // module never defines a page at that path, only at the nested
  // /backend/dealers/{id}/ledger path CONTRACT-HANDOFF assigns to it.
  navHidden: true,
  breadcrumb: [
    { label: 'Payouts', labelKey: 'payouts.admin.dealerPicker.title', href: '/backend/payouts' },
    { label: 'Ledger', labelKey: 'payouts.admin.ledger.title' },
  ],
}
