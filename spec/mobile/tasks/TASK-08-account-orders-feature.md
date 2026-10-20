---
id: TASK-08
title: Account + Orders feature — guest-mode account tab, guest order lookup, address book UI
status: Done (sandbox-verified — see spec/mobile/IMPLEMENTATION-NOTES.md)
---

# TASK-08 — Account & Orders feature

## Objective

Build the Account tab and Order detail/lookup screens under the **guest-only auth** constraint locked in for this pass. Ports the *shape* of FEAT-005 (Customer Accounts & Address Book) and FEAT-006 (Order History & Detail) without real login — see the explicit scoping below before writing any code.

## Why this task looks different from a normal port

The backend's `GET /storefront/orders` (list) and all `/storefront/account/addresses` endpoints require `requireCustomer()` — a signed-in session. This app has no login screen in v1. So:
- **Account tab**: shows a clear "Browsing as guest — sign in coming soon" banner. It is a real, finished screen (not a crash or dead end) — just one that doesn't pretend to offer account features it can't deliver yet.
- **Order history**: instead of the list endpoint, this app tracks **order IDs locally** (persisted via `expo-secure-store` or `AsyncStorage`) the moment TASK-07's checkout places an order, alongside the order's confirmation details needed to re-fetch it. Each tracked order is then fetched via `GET /storefront/orders/{id}`, which **does** work for a guest holding the `sf_order_access` cookie set at checkout. This gives a real, working "my recent orders" list scoped to this device/session — not the full cross-device history a signed-in customer would get.
- **Address book**: build the full CRUD UI against the real endpoints (`listAddresses`/`createAddress`/`updateAddress`/`deleteAddress` from TASK-04), but gate it behind a "sign in to manage saved addresses" message, since every call will 401 without a session. This keeps the screen's structure ready for the moment real auth lands — at that point, only the gating condition needs to change, not the screen itself.

**This entire scoping decision must be written at the top of `AccountScreen.tsx` as a comment** so a future contributor adding real login knows exactly what to flip on (remove the gate, wire a login screen, call `listMyOrders()` instead of the local-tracking approach).

## Boundaries

**You own (overwrite TASK-01's stubs, then everything else under this path):** `apps/mobile/src/features/account/**` and `apps/mobile/src/features/orders/**`, specifically:
- `src/features/account/screens/AccountScreen.tsx`
- `src/features/account/screens/AddressesScreen.tsx`
- `src/features/orders/screens/OrderDetailScreen.tsx`
- `src/features/orders/hooks/useLocalOrderHistory.ts` (reads/writes the locally tracked order-ID list)
- `src/features/account/components/AddressForm.tsx` (reuse TASK-04's `addressSchema` for validation — do not re-implement)

**Do not touch:** `src/lib/api/**`, `src/components/ui/**`, `src/theme/**`, navigation, `package.json`/`app.json`.

## Contracts consumed

From TASK-04's `orders.ts`: `getOrder`, `OrderDetail`, `OrderSummary` types. (`listMyOrders` exists in TASK-04 but is **not called** by this task — see Non-goals.)

From TASK-04's `addresses.ts`: `listAddresses`, `createAddress`, `updateAddress`, `deleteAddress`, `StoredAddress`, `Address`.

From TASK-03: `ApiError` (to detect `status === 401` and render the sign-in gate specifically, vs. a generic error).

From TASK-02: `Button`, `Card`, `Badge`, `LoadingState`, `EmptyState`, `ErrorState`.

From TASK-01's `src/navigation/types.ts`: `AccountStackParamList` (`Account`, `Addresses`, `OrderDetail`).

## Contracts produced

`src/features/orders/hooks/useLocalOrderHistory.ts`:
```ts
export interface TrackedOrder { orderId: string; orderNumber: string; placedAt: string }
export interface UseLocalOrderHistoryResult {
  orders: TrackedOrder[]
  track: (order: TrackedOrder) => Promise<void> // TASK-07 calls this on successful checkout
  isLoading: boolean
}
export function useLocalOrderHistory(): UseLocalOrderHistoryResult
```
TASK-07's `ConfirmationScreen` should call `track()` after a successful order placement — if TASK-07 lands before this task, it's fine for that call to be a TODO stub there until this hook exists; this is a one-line integration TASK-09 should double check during final wiring.

## Backend endpoints used

- `GET /api/storefront/orders/{id}` — order detail, works for guest via `sf_order_access` cookie set during TASK-07's checkout.
- `GET /api/storefront/account/addresses`, `POST .../addresses`, `PUT/DELETE .../addresses/{id}` — wired for completeness; expect `401 {error, code:'authentication_required'}` on every call until real auth exists. Render the "sign in to manage saved addresses" gate on that specific error code, not a generic failure screen.

## Acceptance criteria (scoped to guest-only v1)

- Account tab always renders (no crash, no blank screen) and clearly communicates guest-mode status.
- A guest who just completed checkout in TASK-07 sees that order appear in the local order-history list without needing to do anything else.
- Tapping a tracked order navigates to `OrderDetail`, which shows lines, gift options, delivery method, totals, and current payment status — matching FEAT-006's order-detail acceptance criteria.
- A signed-out user cannot see any *other* customer's order (there is no path to guess another `sf_order_access` token — this is enforced backend-side, this task just shouldn't log or expose tokens in a way that undermines that).
- Address book screen shows the "sign in to manage saved addresses" gate instead of a raw 401 error.

## Dependencies to add

```
expo-secure-store
```

## Non-goals (explicit — do not implement these in this pass)

- No login/signup screens, no password reset, no email verification UI.
- No call to `listMyOrders()` (the authenticated order-list endpoint) — it exists in TASK-04's client for the future but has no caller here.
- No cross-device order history — tracked orders live only in this device's local storage.
- This task's "fast-follow" is: once a real auth decision is made (see `spec/phase-1/index.md`'s Known Gaps and `spec/phase-2`'s ADRs for the backend-side context), add login/signup screens, swap `useLocalOrderHistory` for `listMyOrders()`, and remove the address-book gating condition. That is a new task, not part of this one.
