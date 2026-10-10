# Feature: Order History & Detail

- **Feature ID:** FEAT-006
- **Status:** Implemented
- **Objective:** Allow customers and guests to view their past orders, including gift options, delivery, and payment status.
- **Business Value:** Post-purchase visibility builds trust and reduces support requests about order status.
- **Scope:** Order list for logged-in customers, order detail for customers (by ID) and guests (via access token), gift metadata per line (gift wrap, gift message).
- **Out of Scope:** Order tracking/shipping updates (requires shipping integration, Phase 4), returns/refunds (Phase 2+).

## Current Behavior

**Verified** from `apps/storefront/docs/backend-api-contract.md` and storefront pages.

- `GET /api/storefront/orders` — returns the customer's order history (requires `customer_auth_token` cookie).
- `GET /api/storefront/orders/{id}` — returns order detail. Accessible to:
  - Logged-in customer who placed the order.
  - Guest who placed the order, via the `sf_order_access` httpOnly cookie set at checkout.
- Order lines include `gift_wrap`, `gift_message`, product name, variant, quantity, and line total.
- The order detail page shows lines, gift options, delivery method, shipping address, and payment status.

## Requirements

1. A logged-in customer must see a list of their orders at `/account/orders`.
2. An order detail page must show lines, gift options, delivery method, and totals.
3. A guest who placed an order must be able to view that order via the `sf_order_access` cookie.
4. A logged-out customer must not be able to access order history.
5. Payment status must reflect the current state (`pending`, `paid`, etc.).

## Dependencies

- Open Mercato `sales` module — orders
- `storefront` module — order history API, guest access token
- [FEAT-004](checkout-orders.md) — order creation and guest access token issuance
- [FEAT-006](customer-accounts.md) — customer session

## Evidence

- `apps/storefront/src/app/account/orders/page.tsx` — order list page
- `apps/storefront/src/app/order/[id]/confirmation/page.tsx` — order confirmation
- `apps/storefront/docs/backend-api-contract.md` §Orders — API contract
- `apps/storefront/__integration__/storefront-and-admin.spec.ts` — Customer accounts and admin orders sections

## Known Limitations

- No shipping tracking; status shows "pending" for all new orders.
- No refund or return flow.
