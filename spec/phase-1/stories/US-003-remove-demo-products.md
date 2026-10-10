# US-003: Remove Non-Gift Demo Products from the Storefront

- **Phase:** 1
- **Status:** Done
- **Priority:** Medium
- **Parent Features:** [FEAT-001](../features/FEAT-001-gift-catalog.md)

## User Story

As a shopper,
I want the product catalog to show only curated gift products,
so that I am not confused by generic demo items that are not part of the gift marketplace.

## Context

The Open Mercato starter template seeds 4 generic demo products that appear alongside the 12 gift products in the catalog. These are not gift products — they have no gift profile, no occasions, and no gift wrap options.

## Acceptance Criteria

1. The products listing page shows only products that are intended for the gift marketplace.
2. The 4 demo products do not appear in search, category filters, or the featured products section.
3. The product count on the listing page reflects only gift products.

## Implementation Notes

Implemented via a `giftOnly` catalog filter rather than product deletion:

1. Added `giftOnly: z.enum(['true', 'false']).optional()` to `catalogProductsQuerySchema` in `apps/mercato/src/modules/storefront/data/validators.ts`.
2. In `apps/mercato/src/modules/storefront/lib/catalog.ts`, `listStorefrontProfiles` is also triggered when `giftOnly=true`, intersecting the product ID set with all products that have a gift profile.
3. In `apps/storefront/src/lib/api/catalog.ts`, `listProducts` now accepts `giftOnly?: boolean` and passes `giftOnly: 'true'` when set.
4. In `apps/storefront/src/app/products/page.tsx`, `listProducts` is called with `giftOnly: true`.

This approach is preferable to deletion: it preserves products for admin use, is reversible, and correctly excludes any future non-gift products.

## Definition of Done

- Products listing shows only gift products (those with a gift profile).
- No 404s for demo product URLs that may be linked anywhere.
