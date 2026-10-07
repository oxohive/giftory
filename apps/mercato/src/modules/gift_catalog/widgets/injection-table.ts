import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

/**
 * `crud-form:catalog.product` is the catalog product edit form's base host
 * (declared FROZEN in `catalog/extension-points.ts` as `productForm`, rendered by
 * `backend/catalog/products/[id]/page.tsx`). `kind: 'group'` + `column: 2`
 * renders the editor as its own card in the form's secondary column, the same
 * placement the WMS inventory profile uses.
 *
 * Declared as one static object literal so the generator's fact extractor can
 * read it; the entry is inert when the catalog module is absent.
 */
export const injectionTable: ModuleInjectionTable = {
  'crud-form:catalog.product': [
    {
      widgetId: 'gift_catalog.injection.product-gift-profile',
      kind: 'group',
      column: 2,
      groupLabel: 'gift_catalog.widgets.productProfile.groupLabel',
      groupDescription: 'gift_catalog.widgets.productProfile.groupDescription',
      priority: 110,
    },
  ],
}

export default injectionTable
