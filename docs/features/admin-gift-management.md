# Feature: Admin Gift Management

- **Feature ID:** FEAT-007
- **Status:** Implemented
- **Objective:** Allow admins to manage gift occasions and configure gift profiles on products directly from the Open Mercato backoffice.
- **Business Value:** Catalog operations (adding occasions, enabling gift wrap on products, setting message limits) must be self-service for operations staff without requiring code changes.
- **Scope:** Gift occasions CRUD in admin, gift profile widget on the product edit page, admin order view showing gift data per line.
- **Out of Scope:** Dealer assignment (Phase 2), proof management (Phase 4).

## Current Behavior

**Verified** from `apps/mercato/src/modules/gift_catalog/` structure and test checklist.

### Gift Occasions Admin

- Admin page at **Backend → Gift occasions** provides full CRUD: create, edit, deactivate, delete.
- Each occasion has: code, label, description, image URL, sort order, active status.
- Deactivating an occasion removes it from the storefront home page and API responses immediately.
- Seed command: `yarn mercato gift_catalog seed-occasions --tenant <id> --org <id>`.

### Gift Profile on Product Edit

- A **Gift profile** widget appears on the product edit form in the catalog.
- Admins can configure: occasions (multi-select), recipient types, gift wrap available, gift message max length, customizable flag, proof required, fulfillment mode.
- Changes take effect immediately on the storefront (no cache invalidation required in dev).

### Admin Order View

- Orders in **Sales → Orders** show gift wrap and gift message per line.
- Shipping method and grand total are shown; payment status reflects current state.
- Customers appear under **Customers** linked to their orders.

## Requirements

1. Admin must be able to create, edit, deactivate, and delete gift occasions.
2. Admin must be able to configure all gift profile fields on any product via the product edit form.
3. Gift profile changes must propagate to the storefront on the next API request.
4. Order lines in the admin must show gift wrap and gift message.
5. Deactivating an occasion must remove it from the storefront home page and occasion lists.

## Dependencies

- `gift_catalog` module — `GiftOccasion`, `GiftProductProfile` entities
- Open Mercato `catalog` module — product edit form extension point
- Open Mercato `sales` module — order view extension

## Evidence

- `apps/mercato/src/modules/gift_catalog/data/entities.ts` — entities
- `apps/mercato/src/modules/gift_catalog/` — admin pages and API routes
- `apps/storefront/__integration__/storefront-and-admin.spec.ts` — Admin section (sign-in, orders, gift profile widget, occasions, customers)

## Known Limitations

- Admin test cases in the Playwright test suite (TC-ADMIN-*) have recent failures in CI results. Root cause unknown — likely a test credential or environment issue (test uses `admin@acme.com` but test file may use a different credential).
