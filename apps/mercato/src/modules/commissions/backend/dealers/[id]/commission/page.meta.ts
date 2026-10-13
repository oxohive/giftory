export const metadata = {
  requireAuth: true,
  requireFeatures: ['commissions.view'],
  pageTitle: 'Dealer commission history',
  pageTitleKey: 'commissions.admin.dealerHistory.title',
  // Reached from the dealer picker (/backend/commission-rules/dealers) or
  // a dealer-scoped rule's row action — never listed on its own in the
  // sidebar, mirroring `payouts`'s `/backend/dealers/[id]/ledger` sibling
  // route (same `/backend/dealers/{id}/...` leaf convention, different
  // sub-path — no route collision: this module never registers a
  // top-level `/backend/dealers` page itself).
  navHidden: true,
  breadcrumb: [
    { label: 'Dealer commission history', labelKey: 'commissions.admin.dealerHistory.picker.title', href: '/backend/commission-rules/dealers' },
    { label: 'History', labelKey: 'commissions.admin.dealerHistory.title' },
  ],
}
