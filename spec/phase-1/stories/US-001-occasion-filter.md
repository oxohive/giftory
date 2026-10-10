# US-001: Filter Products by Occasion on the Products Listing Page

- **Phase:** 1
- **Status:** Done
- **Priority:** High
- **Parent Features:** [FEAT-001](../features/FEAT-001-gift-catalog.md), [FEAT-002](../features/FEAT-002-gift-occasions.md)

## User Story

As a shopper,
I want to filter the products listing by occasion (Birthday, Anniversary, etc.),
so that I can quickly find gift ideas relevant to the event I am shopping for.

## Context

The occasion filter is **fully implemented end-to-end** — the products page already reads `?occasion=<code>`, fetches matching product IDs from the gift catalog, and passes them to the listing query. The backend `GET /api/storefront/catalog/products` accepts `occasion` and filters by gift profile. The only visible issue was that the error-fallback alert text read "Occasion filter coming soon" instead of accurately describing a temporary API unavailability. That text was updated to "Occasion filter temporarily unavailable / Gift tags are currently unavailable — showing all gifts instead."

## Acceptance Criteria

1. Given a shopper clicks a "Birthday" tile on the home page, when the products page loads, then only products tagged with the `birthday` occasion are shown.
2. Given the products page, when an occasion filter chip/selector is present and a shopper selects an occasion, then the product list updates to show only matching products.
3. Given the products page is loaded with `?occasion=birthday`, when the page renders, then the Birthday filter is shown as active.
4. Given no products match the selected occasion, when the filter is applied, then an appropriate empty-state message is shown.
5. The "coming soon" alert is removed.
6. Existing filters (category, price range, search, sort) still work alongside the occasion filter.

## Implementation Notes

- Reading `occasion` from the URL query string and passing it to the catalog API call was already wired up.
- The alert fallback text was updated from "Occasion filter coming soon" to "Occasion filter temporarily unavailable".

## Definition of Done

- All acceptance criteria pass.
- No regression in other product listing filters.
- Playwright tests `TC-SF-BROWSE-001` / `TC-SF-BROWSE-002` pass (or are updated to cover this).
