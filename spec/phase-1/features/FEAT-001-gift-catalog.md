# Feature: Gift Product Catalog

- **Feature ID:** FEAT-001
- **Phase:** 1
- **Status:** Implemented
- **Objective:** Allow shoppers to browse, filter, and view gift products with gift-specific metadata.
- **Business Value:** Core discovery surface — customers must find the right product before they can buy.
- **Scope:** Product listing page, product detail page, category tree, gift profile metadata (occasions, recipients, customizable flag, gift wrap, gift message config).
- **Out of Scope:** 3D customization (Phase 3), occasion-based filtering on the products page (see US-001).

## Current Behavior

**Verified** from `apps/storefront/src/app/products/` and `apps/mercato/src/modules/gift_catalog/`.

- `GET /api/storefront/catalog/products` returns paginated products with filters: `search`, `categoryId`, `categoryIds`, `handle`, `ids`, `minPrice`, `maxPrice`, `occasion`, `recipient`, `customizable`, `sort`, `page`, `pageSize`, `giftOnly`.
- `GET /api/storefront/catalog/products/{handle-or-id}` returns a product with variants, media, and gift profile.
- `GET /api/storefront/catalog/categories` returns the category tree.
- `GET /api/gift_catalog/storefront/profiles` returns gift profiles filtered by `productIds`.
- `GET /api/gift_catalog/storefront/occasions` returns the active occasions list.
- The storefront products page (`/products`) supports category filter, price range, text search, and sort.
- Product detail pages show variant price switching, customizable badge, gift wrap toggle, and gift message field.
- `giftOnly=true` filters out non-gift products (implemented for US-003).

## Gift Profile Entity

Table: `gift_product_profiles` (`apps/mercato/src/modules/gift_catalog/data/entities.ts`)

| Field | Type | Notes |
|---|---|---|
| `occasions` | `text[]` | Occasion codes (e.g. `birthday`, `anniversary`) |
| `recipient_types` | `text[]` | `him`, `her`, `kids`, `parents`, `couple`, `friend`, `colleague`, `anyone` |
| `is_customizable` | `bool` | Shows "3D designer coming soon" badge |
| `proof_required` | `bool` | Drives proof workflow (Phase 4) |
| `gift_wrap_available` | `bool` | Enables gift wrap option in storefront |
| `gift_message_max_length` | `int` | Default 250 characters |
| `fulfillment_mode` | `platform` \| `dealer` | Dealer assignment (Phase 2) |

## Occasion Codes (Verified)

`birthday`, `anniversary`, `wedding`, `baby_shower`, `graduation`, `valentines`, `festival`, `corporate`, `thank_you`, `other`

## Requirements

1. Product list must display INR (₹) prices.
2. Category, price range, text search, and sort filters must work.
3. Product detail must display the correct variant price on variant selection.
4. Products with `is_customizable: true` must show the customizable badge.
5. Products with `gift_wrap_available: true` must show the gift wrap toggle.
6. The gift message field must enforce `gift_message_max_length`.
7. Occasion and recipient filters must return matching products via the API.
8. `giftOnly=true` must exclude products with no gift profile from the storefront listing.

## Dependencies

- Open Mercato `catalog` module (products, variants, categories)
- `gift_catalog` module (gift profiles, occasions)
- Storefront BFF proxy (`/api/om/storefront/*`, `/api/om/gift_catalog/*`)

## Related User Stories

- [US-001](../stories/US-001-occasion-filter.md) — Occasion filter on products page
- [US-003](../stories/US-003-remove-demo-products.md) — Remove non-gift demo products

## Evidence

- `apps/storefront/src/app/products/page.tsx` — products listing with filters
- `apps/storefront/src/app/products/[slug]/page.tsx` — product detail
- `apps/mercato/src/modules/gift_catalog/data/entities.ts` — GiftProductProfile entity
- `apps/mercato/src/modules/gift_catalog/` — gift catalog module
- `apps/storefront/docs/backend-api-contract.md` — catalog API contract

## Known Limitations

- No live courier rates; delivery charges are flat (Standard ₹49 / Express ₹149).
- No GST rates configured.
