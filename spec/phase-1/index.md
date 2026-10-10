# Phase 1 — Commerce Foundation

- **Status:** Implemented
- **Goal:** End-to-end gift commerce — catalog, cart, checkout, payments, customer accounts, order history, admin gift management.

## Feature Index

| ID | Feature | Status |
|---|---|---|
| [FEAT-001](features/FEAT-001-gift-catalog.md) | Gift Product Catalog | Implemented |
| [FEAT-002](features/FEAT-002-gift-occasions.md) | Gift Occasions | Implemented |
| [FEAT-003](features/FEAT-003-shopping-cart.md) | Shopping Cart | Implemented |
| [FEAT-004](features/FEAT-004-checkout-orders.md) | Checkout & Order Placement | Implemented |
| [FEAT-005](features/FEAT-005-customer-accounts.md) | Customer Accounts & Address Book | Implemented |
| [FEAT-006](features/FEAT-006-order-history.md) | Order History & Detail | Implemented |
| [FEAT-007](features/FEAT-007-admin-gift-management.md) | Admin Gift Management | Implemented |

## User Stories

| ID | Story | Status |
|---|---|---|
| [US-001](stories/US-001-occasion-filter.md) | Filter Products by Occasion | Done |
| [US-002](stories/US-002-e2e-test-suite.md) | Pass Phase 1 E2E Test Suite | In Progress |
| [US-003](stories/US-003-remove-demo-products.md) | Remove Non-Gift Demo Products | Done |
| [US-004](stories/US-004-email-verification-links.md) | Fix Email Verification Links (Gap G7) | Done (env var required in prod) |

## Known Gaps

- **US-002** still in progress — checkout, account, and admin Playwright suites need verification; payment flows need Stripe + Razorpay test keys. Address book CRUD and guest cart-merge tests are currently skipped and require a seeded verified customer fixture.
- **Gap G7** (email links) — requires `PLATFORM_PORTAL_BASE_URL` set in `apps/mercato/.env` in production; omitting it causes portal email requests to fail (the framework errors rather than mailing a localhost link).
- **Occasion filter UI** — the API filter and URL wiring are complete; the products-page filter chip selector UI is not fully implemented (clicking a tile on the home page filters via URL, but there is no chip selector on the products page itself).
- **Magic link auth** — BFF proxy routes exist; no storefront UI page implemented.
- **Flat shipping rates** — Standard ₹49 / Express ₹149; no live courier integration until Phase 4.
- **No GST rates** — configured; to be added in a later phase.
