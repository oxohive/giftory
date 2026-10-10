---
id: TASK-05
title: Catalog feature — Home, Product List, Product Detail
status: Done (sandbox-verified — see spec/mobile/IMPLEMENTATION-NOTES.md)
---

# TASK-05 — Catalog feature

## Objective

Build the Home (occasion tiles), Product List (search/filter), and Product Detail screens, overwriting the placeholder stubs TASK-01 created. Ports FEAT-001 (Gift Product Catalog) and FEAT-002 (Gift Occasions).

## Boundaries

**You own (overwrite TASK-01's stubs, then everything else under this path):** `apps/mobile/src/features/catalog/**`, specifically:
- `src/features/catalog/screens/HomeScreen.tsx`
- `src/features/catalog/screens/ProductListScreen.tsx`
- `src/features/catalog/screens/ProductDetailScreen.tsx`
- Any local components/hooks you need, e.g. `src/features/catalog/components/OccasionTile.tsx`, `ProductCard.tsx`, `ProductFilters.tsx`, `src/features/catalog/hooks/useProducts.ts`, `useOccasions.ts`, `useProductDetail.ts`.

**Do not touch:** `src/lib/api/**` (TASK-03/04 own it — import from it), `src/components/ui/**` / `src/theme/**` (TASK-02 owns it — import from it), navigation files, `package.json`/`app.json`.

## Contracts consumed

From TASK-04's `catalog.ts`/`occasions.ts`: `listProducts`, `getProductByHandle`, `listCategories`, `listOccasions`, `getGiftProfiles`, and the `Product`/`ProductDetail`/`Category`/`Occasion`/`ListEnvelope<T>` types (see TASK-04 for exact shapes).

From TASK-02: `Button`, `Card`, `PriceText`, `LoadingState`, `EmptyState`, `ErrorState`, `Badge`, `theme`/`useTheme()`.

From TASK-01's `src/navigation/types.ts`: `CatalogStackParamList` (`Home`, `ProductList`, `ProductDetail`). Use `@react-navigation/native-stack`'s typed screen props against this param list.

## Backend endpoints used

- `GET /api/gift_catalog/storefront/occasions` — Home screen's "Shop by occasion" tiles (only active occasions render).
- `GET /api/storefront/catalog/products` — Product List, with `occasion`, `recipient`, `giftOnly`, `search`, `minPrice`/`maxPrice`, `sort` query params wired to on-screen filter controls.
- `GET /api/storefront/catalog/products/{handle}` — Product Detail.
- `GET /api/gift_catalog/storefront/profiles?productIds=...` — only needed if Product Detail's `gift` block from the product-detail response is insufficient; prefer the inline `gift` field already returned by `getProductByHandle` first.
- `GET /api/storefront/catalog/categories` — category filter options in Product List.

## Acceptance criteria (ported from FEAT-001 / FEAT-002)

- INR prices display correctly via `PriceText` everywhere a price appears.
- Category, price-range, search, and sort filters on Product List actually change the `listProducts` query params and the list updates.
- Selecting a product variant on Product Detail updates the displayed price to that variant's pricing.
- A `Badge` reading "Customizable" (or similar) shows on Product Detail when `product.isConfigurable`/`gift.isCustomizable` is true.
- When `gift.giftWrapAvailable` is true, Product Detail shows a gift-wrap toggle (state only — it's consumed by TASK-06's add-to-cart flow, this screen just surfaces the option and passes it along).
- A gift-message field is shown and capped at `gift.giftMessageMaxLength` characters with inline validation feedback when exceeded.
- Occasion/recipient filters on Product List produce the same results as if you called the API directly with those params (no client-side re-filtering that could diverge from the backend's logic).
- Tapping a Home occasion tile navigates to Product List pre-filtered to that occasion code.
- Loading, empty ("no products match these filters"), and error (failed fetch, with retry) states are all handled via TASK-02's `LoadingState`/`EmptyState`/`ErrorState`.

## Dependencies to add

```
@tanstack/react-query
```
(List this even if TASK-06 also lists it — TASK-09 dedupes when merging into `package.json`.)

## Non-goals

- No admin-side catalog management (FEAT-007 is admin-only, not ported to mobile).
- Add-to-cart button on Product Detail should call TASK-06's cart hook — if TASK-06 hasn't landed yet, stub the button's `onPress` with a TODO comment rather than blocking this task's screens from being otherwise complete.
