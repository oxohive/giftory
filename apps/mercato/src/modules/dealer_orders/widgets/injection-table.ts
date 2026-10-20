import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

/**
 * `dealer_orders` widget injection table.
 *
 * Only the order-detail "Dealer assignment" tab is injected via this
 * mechanism (FEAT-011 / P2-UI-13). Per
 * tasks/phase-2-ui/CONTRACT-HANDOFF.md's decision for this task: "inject a
 * 'Dealer assignment' panel widget into the core order detail page rather
 * than duplicating order display in a new `dealer_orders`-owned page."
 *
 * Spot id confirmed live in `@open-mercato/core/src/modules/sales/widgets/
 * injection-table.ts` (core's own "History" tab) and already used by
 * `commissions/widgets/injection-table.ts` for its sibling, read-only
 * "Order commission" tab (P2-UI-15, already shipped on the same page) —
 * both modules contribute independently to this one slot with no shared
 * file edited and no collision, which is the whole point of the mechanism.
 * This tab is the ACTION surface (assign/reassign/cancel); commissions'
 * tab stays read-only and untouched.
 *
 * Declared as ONE static object literal (no env-flag branching) per the
 * convention documented in `src/modules/example/widgets/injection-table.ts`.
 */
export const injectionTable: ModuleInjectionTable = {
  'sales.document.detail.order:tabs': [
    {
      widgetId: 'dealer_orders.injection.order-assignment-tab',
      kind: 'tab',
      groupLabel: 'dealer_orders.admin.orderTab.tabLabel',
      // Placed ahead of commissions' read-only tab (priority -5) — the
      // action tab is the primary workflow surface for this order's
      // fulfillment; the commission snapshot is secondary reference info.
      priority: -4,
    },
  ],
}

export default injectionTable
