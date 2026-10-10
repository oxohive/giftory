# Feature: Checkout & Order Placement

- **Feature ID:** FEAT-004
- **Status:** Implemented
- **Objective:** Allow shoppers to enter a delivery address, choose a shipping method, pay, and receive a confirmed order — without creating duplicate orders on retry.
- **Business Value:** Converting a cart to a paid order is the core revenue event. Idempotent order creation prevents double-charges and double-orders.
- **Scope:** Shipping method selection, address entry, idempotent order placement, Stripe and Razorpay payment sessions, payment retry for unpaid orders, order confirmation page, guest order access token.
- **Out of Scope:** Dealer assignment (Phase 2), 3D proof workflow (Phase 4), live shipping rates (currently flat fees).

## Current Behavior

**Verified** from `apps/mercato/src/modules/storefront/data/entities.ts`, route files, and `apps/storefront/docs/backend-api-contract.md`.

### Shipping Methods

- `GET /api/storefront/checkout/shipping-methods` — returns available shipping methods with prices.
- Current rates: Standard ₹49, Express ₹149 (flat; no live courier integration).
- No GST rates configured.

### Order Placement

- `POST /api/storefront/checkout/orders` — places an order from the current cart. Requires `Idempotency-Key` header.
- The idempotency key is stored in `storefront_checkouts`. Retrying with the same key returns the existing order without creating a duplicate.
- On success, the cart status becomes `converted`.
- If no payment keys are configured, the storefront shows: "We could not start the payment. Your order is saved" with a "Complete your payment" panel.

### Payment

- Stripe and Razorpay are both supported. The payment gateway is selected by the shopper.
- `POST /api/storefront/orders/{id}/payment-session` — creates a new payment session for an existing unpaid order (retry flow).
- Payment status lifecycle: `pending` → `processing` → `paid` / `failed`.
- Razorpay confirmation: `POST /api/gateway_razorpay/confirm` (called after Razorpay redirect).
- Webhooks confirm payment server-side: `/api/payment_gateways/webhook/stripe`, `/api/payment_gateways/webhook/razorpay`.

### Guest Order Access

After placing an order as a guest, an `sf_order_access` httpOnly cookie grants access to that specific order's detail page without requiring login.

## Checkout Entity

Table: `storefront_checkouts` — idempotency ledger

| Field | Notes |
|---|---|
| `kind` | `order` \| `payment_retry` |
| `idempotency_key` | Client-supplied; unique per order attempt |
| `request_hash` | Hash of the full request body for exact-match detection |
| `status` | `processing` \| `order_created` \| `completed` |
| `order_id`, `order_number` | Set after order creation |
| `payment_id`, `payment_status` | Set after payment session |
| `guest_access_token_hash` | SHA-256 of the guest access cookie |

## Requirements

1. A shopper must be able to select Standard or Express shipping; the total must update.
2. An invalid 6-digit PIN code must be rejected at checkout.
3. A non-Indian mobile number must be rejected at checkout.
4. Retrying the same `Idempotency-Key` must return the existing order, not create a new one.
5. Both Stripe and Razorpay payment flows must complete successfully with test keys.
6. A declined payment must allow retry on the same order (not create a new order).
7. Webhooks from Stripe and Razorpay must update the order payment status.
8. Guests must be able to view their order after placement via the `sf_order_access` cookie.

## Dependencies

- Open Mercato `checkout`, `sales`, `payment_gateways` modules
- `gateway_razorpay` module (app-owned)
- [FEAT-003](shopping-cart.md) — cart as input
- [FEAT-006](customer-accounts.md) — customer session for authenticated checkout
- [FEAT-008](order-history.md) — order detail after placement

## Evidence

- `apps/mercato/src/modules/storefront/data/entities.ts` — storefront_checkouts entity
- `apps/mercato/src/modules/storefront/__tests__/checkoutRules.test.ts` — checkout validation tests
- `apps/mercato/src/modules/storefront/__tests__/paymentState.test.ts` — payment state tests
- `apps/mercato/src/modules/gateway_razorpay/__tests__/` — Razorpay adapter, signature, webhook tests
- `apps/storefront/docs/backend-api-contract.md` §Checkout — API contract
- `apps/storefront/__integration__/storefront-and-admin.spec.ts` — Checkout section (address validation, delivery options, payment fallback)

## Known Limitations

- Shipping rates are flat (Standard ₹49 / Express ₹149); no live courier integration.
- No GST rates configured.
- Webhooks require a public HTTPS URL and cannot be tested in local development without a tunnel.
- Email verification links in account emails point at the Open Mercato portal, not the storefront (see [US-005](../../tasks/US-005.md) gap G7).
