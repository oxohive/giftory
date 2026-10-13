import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

/**
 * `commissions` widget injection table.
 *
 * Only the order-detail tab is injected via this mechanism. The "Commission
 * Rules" admin sidebar entry is deliberately NOT a `menu:sidebar:main`
 * injection widget — it is an app-owned page (`backend/commission-rules`),
 * so it uses `page.meta.ts`'s `pageGroup`/`icon`/`pageOrder` fields, the
 * same mechanism `gift_catalog` and `payouts` (this repo's two existing
 * precedents) already use for their own app-owned pages. Per
 * `.ai/guides/backend-ui.md`: "Prefer page metadata for app-owned
 * destinations and menu injection for adding/reordering items owned by
 * another module." The order-detail tab below genuinely is the latter
 * case — it adds a surface to the `sales` module's order detail page,
 * which `commissions` does not own.
 *
 * Declared as ONE static object literal (no env-flag branching) per the
 * convention documented in `src/modules/example/widgets/injection-table.ts`
 * — the module-extension-facts generator can only fold a statically known
 * value.
 */
export const injectionTable: ModuleInjectionTable = {
  // Spot id confirmed live in `@open-mercato/core/src/modules/sales/widgets/injection-table.ts`
  // (core's own "History" tab) and in `src/modules/example/widgets/injection-table.ts`
  // (the `sales-todos` demo widget) — both inject into this exact string.
  'sales.document.detail.order:tabs': [
    {
      widgetId: 'commissions.injection.order-commission-tab',
      kind: 'tab',
      groupLabel: 'commissions.admin.orderTab.tabLabel',
      // Placed near the end, just before built-in Comments — this is a
      // secondary, read-only reference tab, not a primary workflow tab.
      priority: -5,
    },
  ],
}

export default injectionTable
