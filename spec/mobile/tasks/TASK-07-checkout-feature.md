---
id: TASK-07
title: Checkout feature — address, shipping, Razorpay payment, confirmation
status: Done — Razorpay providerData field mapping is a best-effort inference, needs live verification (see spec/mobile/IMPLEMENTATION-NOTES.md)
---

# TASK-07 — Checkout feature

## Objective

Build the full checkout flow: address entry → shipping method selection → order placement → Razorpay native payment → confirmation. Ports FEAT-004 (Checkout & Orders), **Razorpay only** (Stripe is out of scope for this pass — the backend and web storefront support both, but mobile v1 ships Razorpay only per explicit user direction).

## Boundaries

**You own (overwrite TASK-01's stubs, then everything else under this path):** `apps/mobile/src/features/checkout/**`, specifically:
- `src/features/checkout/screens/AddressScreen.tsx`
- `src/features/checkout/screens/ShippingScreen.tsx`
- `src/features/checkout/screens/PaymentScreen.tsx`
- `src/features/checkout/screens/ConfirmationScreen.tsx`
- `src/features/checkout/hooks/useCheckoutSession.ts` (local state machine across the 4 screens — address, shipping method, idempotency key, pending order)
- Any local components, e.g. `src/features/checkout/components/AddressForm.tsx`.

**Do not touch:** `src/lib/api/**`, `src/components/ui/**`, `src/theme/**`, navigation, `package.json`/`app.json` — if you need `react-native-razorpay`, list it under Dependencies to add, do not install it yourself.

## Contracts consumed

From TASK-04's `checkout.ts`: `getShippingMethods`, `placeOrder`, `openPaymentSession`, and `Address`/`ShippingMethod`/`PaymentSession`/`PlacedOrder`/`PlaceOrderInput` types. Reuse TASK-04's `addressSchema` (zod) for form validation rather than re-implementing India phone/PIN validation.

From TASK-04's `payments.ts`: `confirmRazorpayPayment`.

From TASK-03: `newIdempotencyKey()`, `env.razorpayKeyId`, `money.ts` (`formatMoney`).

From TASK-06's `useCart()`: read `cart.totals` to compute `subtotalMajor`/`itemCount` for the shipping-methods query, and call `clear()` on confirmed order success.

From TASK-01's `src/navigation/types.ts`: `CheckoutStackParamList` (`Address`, `Shipping`, `Payment`, `Confirmation`).

From TASK-02: `Button`, `Input`, `Card`, `PriceText`, `LoadingState`, `ErrorState`.

## Backend endpoints used

- `GET /api/storefront/checkout/shipping-methods?subtotal=&itemCount=&postalCode=` — call once the address screen has a postal code, to show accurate rates before the user commits.
- `POST /api/storefront/checkout/orders` — **requires `Idempotency-Key` header**. Generate the key once per checkout attempt (via `newIdempotencyKey()`) and persist it in `useCheckoutSession`'s state for the duration of the attempt — if the user retries after a network error, **reuse the same key** so the backend's idempotent-replay behavior (same key + same body → returns the existing order, no duplicate) actually protects against double-charging. Only generate a *new* key if the user explicitly abandons and restarts checkout.
- `POST /api/storefront/orders/{id}/payment-session` — call this (with a **fresh** idempotency key) if the Razorpay payment is declined/cancelled and the user wants to retry payment on the same order, instead of calling `placeOrder` again.
- `POST /api/gateway_razorpay/confirm` — called after `react-native-razorpay`'s success callback, with `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` taken directly from that callback's payload, plus its own fresh `Idempotency-Key`.

## Razorpay native integration — exact mapping

The backend's `paymentSessionSchema` response (from `placeOrder`/`openPaymentSession`) gives you `{ providerKey: 'razorpay', sessionId, clientSecret, providerData, ... }`. The web storefront currently uses Razorpay Checkout.js with:
```js
new Razorpay({ key: keyId, order_id: orderId, amount, currency, description })
```
For the native SDK, call:
```ts
import RazorpayCheckout from 'react-native-razorpay'

const options = {
  key: env.razorpayKeyId,        // from TASK-03's env.ts — NEVER the secret
  order_id: paymentSession.sessionId, // confirm against providerData if sessionId isn't the Razorpay order_id — inspect providerData's fields if the mapping isn't 1:1, do not guess silently
  amount: toMinorUnits(order.totals.grandTotalMajor), // Razorpay expects amount in paise (integer minor units) — this is the one place in the whole app where you intentionally send minor units over a Razorpay-SDK boundary, not the backend's own wire format
  currency: order.currencyCode,
  name: 'Giftory',
  description: `Order ${order.orderNumber}`,
}

RazorpayCheckout.open(options)
  .then((data) => confirmRazorpayPayment({
    razorpay_order_id: data.razorpay_order_id,
    razorpay_payment_id: data.razorpay_payment_id,
    razorpay_signature: data.razorpay_signature,
  }, newIdempotencyKey()))
  .catch((error) => { /* user cancelled or payment failed — show ErrorState with a retry that calls openPaymentSession again */ })
```
If `paymentSession.sessionId` does not actually correspond to Razorpay's `order_id` field, check `paymentSession.providerData` for the correct field name before shipping — do not assume without checking the actual response once the backend is reachable. Flag this explicitly in your PR/commit notes if the mapping required a change from what's written here.

**Security**: `env.razorpayKeyId` must be the **Key ID only**. The Key Secret lives only in `apps/mercato/.env` for server-side HMAC verification in `gateway_razorpay/api/confirm`. If you ever find yourself needing the secret on the client to make this work, stop — that means the integration is wrong, not that the secret should move client-side.

## Acceptance criteria (ported from FEAT-004, Razorpay-only)

- Standard/Express shipping methods are selectable and the displayed total updates accordingly.
- An invalid 6-digit PIN or a non-Indian mobile number is rejected inline before submission (via TASK-04's `addressSchema`).
- Submitting the same checkout attempt twice (e.g. double-tap, or retry after a timeout) with the same idempotency key does not create a duplicate order — verify this against a real backend before marking this task done, not just by code review.
- A declined/cancelled Razorpay payment allows retrying on the *same* order via `openPaymentSession`, not a brand-new `placeOrder` call.
- On confirmed success, the Confirmation screen shows order number, totals, and gift details per line; `useCart().clear()` is called so the cart is empty afterward.
- Loading and error states (network failure, gateway down — backend returns 502 but the order may already exist) are handled without leaving the user unsure whether they were charged — on any ambiguous failure, show a message directing them to check Order status (TASK-08) rather than silently retrying `placeOrder`.

## Dependencies to add

```
react-native-razorpay
```

## Non-goals

- No Stripe integration.
- No saved/default address selection (TASK-08's address book is for a signed-in customer only; guest checkout here always collects a fresh address — reusing a saved address is a fast-follow once real auth exists).
