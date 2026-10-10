# Feature: Gift Occasions

- **Feature ID:** FEAT-002
- **Phase:** 1
- **Status:** Implemented
- **Objective:** Define curated gift occasions (Birthday, Anniversary, etc.) that organize the storefront home page and filter the catalog.
- **Business Value:** Occasion-driven discovery is the primary shopping pattern — "I need a birthday gift" — so occasions are the storefront's main navigation intent.
- **Scope:** Occasion management in admin (CRUD, activate/deactivate), public occasion list API, "Shop by occasion" tiles on the storefront home page.
- **Out of Scope:** Occasion filter on the products listing page (see [US-001](../stories/US-001-occasion-filter.md)).

## Current Behavior

**Verified** from `apps/mercato/src/modules/gift_catalog/` and storefront pages.

- `GET /api/gift_catalog/storefront/occasions` returns active occasions for the shop (tenant + org scoped, sorted by `sort_order`).
- Admin CRUD: `GET/POST /api/gift_catalog/occasions`, with edit/delete per occasion. Admins can set code, label, description, image URL, sort order, and active status.
- The storefront home page renders "Shop by occasion" tiles using the occasions list.
- Deactivating an occasion removes it from the home page tiles and the occasion filter results.
- Seeded default occasions: `birthday`, `anniversary`, `wedding`, `baby_shower`, `graduation`, `valentines`, `festival`, `corporate`, `thank_you`, `other`.

## Occasion Entity

Table: `gift_occasions` (`apps/mercato/src/modules/gift_catalog/data/entities.ts`)

| Field | Type |
|---|---|
| `code` | Unique text identifier (e.g. `birthday`) |
| `label` | Display name (e.g. "Birthday") |
| `description` | Optional description |
| `sort_order` | Integer for ordering |
| `is_active` | Bool — inactive occasions are hidden from shoppers |
| `image_url` | Optional image for the tile |

## Requirements

1. Active occasions must appear on the storefront home page as "Shop by occasion" tiles.
2. Deactivating an occasion must hide it from shoppers without deleting it.
3. Admin must be able to create, edit, deactivate, and delete occasions.
4. Occasion codes must be unique within a tenant + organization scope.

## Dependencies

- `gift_catalog` module
- Storefront home page (`apps/storefront/src/app/page.tsx`)
- [FEAT-001](FEAT-001-gift-catalog.md) — occasion filter on catalog API

## Related User Stories

- [US-001](../stories/US-001-occasion-filter.md) — Occasion filter on products page

## Evidence

- `apps/mercato/src/modules/gift_catalog/data/entities.ts` — GiftOccasion entity
- `apps/storefront/src/app/page.tsx` — home page fetching occasions
- `apps/mercato/src/modules/gift_catalog/` — admin pages and API routes
- `apps/storefront/__integration__/storefront-and-admin.spec.ts` — "Admin — gift occasions management" suite

## Known Limitations

- Occasion-based filtering on the products listing page is implemented end-to-end but the UI chips are not fully built out (see [US-001](../stories/US-001-occasion-filter.md)).
