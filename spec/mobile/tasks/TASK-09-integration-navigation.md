---
id: TASK-09
title: Integration — final navigation wiring, dependency merge, QA pass
status: Done (sandbox-verifiable scope) — live-backend/device QA still open, see QA Results
---

# TASK-09 — Integration & navigation

## Objective

This is the **only task that runs strictly after TASK-01 through TASK-08 are all complete** — it is a real dependency, not an artificial collision. It wires every feature's screens into the real navigation graph, merges every task's declared dependencies into `package.json`/`app.json` exactly once, resolves any naming/shape mismatches between tasks, and runs a manual QA pass against the ported FEAT acceptance criteria.

## Boundaries

**You own:** `apps/mobile/src/navigation/**` (final wiring — replacing TASK-01's placeholder-screen navigator with the real `CatalogStackParamList`/`CheckoutStackParamList`/`AccountStackParamList` navigators pointing at the now-real screens from TASK-05 through TASK-08), plus the final state of `apps/mobile/package.json`, `app.json`/`app.config.ts`, `tsconfig.json`, `babel.config.js`.

By this point every other task's files already exist — you are not rewriting their feature logic, only: (a) the navigator wiring, (b) the dependency manifest, (c) fixing integration-only issues (an import path that doesn't match what another task's file actually exports, a prop-name mismatch between a screen and TASK-02's component, etc.).

## Steps

1. **Read every task file's "Dependencies to add" section** (TASK-01 through TASK-08) and merge them into `apps/mobile/package.json` once, deduping (e.g. `@tanstack/react-query` is listed by both TASK-05 and TASK-06 — install once). Run the install, confirm no peer-dependency conflicts.
2. **Read every task file's "Contracts produced"/"Contracts consumed" sections** and verify each consuming import actually resolves to what the producing task shipped — fix any drift (e.g. if TASK-04 ended up naming a field `grandTotalMajor` but TASK-07 expects `totals.grandTotalMajor`, reconcile to one name, preferring whichever the actual backend response shape supports once verified against a live `apps/mercato` dev server).
3. **Wire the real navigators**: replace TASK-01's placeholder-screen imports in `src/navigation/**` with the real exports from `src/features/{catalog,cart,checkout,account,orders}/screens/*`. Keep the typed `RootTabParamList`/`CatalogStackParamList`/`CheckoutStackParamList`/`AccountStackParamList` from TASK-01 unless a feature task's acceptance criteria genuinely required an extra route — if so, add it here and note why.
4. **Wire the cross-feature calls flagged as TODOs**: TASK-05's Product Detail "add to cart" button → TASK-06's `useCart().addLine()`; TASK-07's Confirmation screen → TASK-08's `useLocalOrderHistory().track()`.
5. **Typecheck**: `npx tsc --noEmit` across the whole app, zero errors.
6. **Run `npx expo-doctor`** (or equivalent Expo config sanity check) to catch config-plugin issues from `react-native-razorpay`'s native linking.
7. **Manual QA pass** against this checklist (run the app against the actual `apps/mercato` dev server — `APP_URL=http://localhost:3000`, LAN IP on-device, with a real `EXPO_PUBLIC_ORG_ID`/`EXPO_PUBLIC_ORG_SLUG` and the user-supplied Razorpay **test** Key ID in `.env`):
   - FEAT-001/002 (catalog/occasions): browse, filter, open a product, select a variant, see the price update.
   - FEAT-003 (cart): add a gift-wrapped item with a message, change quantity, remove a line, confirm the cart survives an app restart.
   - FEAT-004 (checkout, Razorpay only): complete a full guest checkout with the test Razorpay key end-to-end, confirm the order appears on the Confirmation screen, confirm retrying a declined payment doesn't duplicate the order.
   - FEAT-005/006 (account/orders, guest-scoped): confirm the just-placed order appears under Account → Orders, confirm the address-book screen shows the sign-in gate rather than erroring.
8. **Document the manual QA results** (pass/fail per item) in this file's own `## QA Results` section when you run it — append, don't just mark a checkbox blind.

## Non-goals

- No new features. If QA uncovers a real gap in scope (e.g. a FEAT acceptance criterion this task breakdown missed), write it up as a new task file rather than quietly expanding this one.
- No Stripe, no real login — those remain explicitly out of scope per `spec/mobile/README.md`.

## QA Results

This sandbox has no simulator/device/emulator and no reachable `apps/mercato` dev server, so the FEAT-001–006 manual QA pass described in Step 7 could not be run end-to-end against a live backend. What follows is what could actually be verified here (static reasoning, code reading, and `tsc`/`expo-doctor`), and what remains genuinely open.

### Integration fixes verified statically

- **Shared `QueryClientProvider`**: one `queryClient` (`src/lib/queryClient.ts`) mounted once in `App.tsx` above `RootTabNavigator`. Confirmed by grep that no other `<QueryClientProvider>` instantiation remains anywhere in `src/` — the two local stand-in clients (catalog, cart) and their wrapper components were deleted, and the four screens that used them (`HomeScreen`, `ProductListScreen`, `ProductDetailScreen`, `CartScreen`) now export their content directly. `useCart()` calls from `ProductDetailScreen`, `ShippingScreen`, and `ConfirmationScreen` all now read/write the same cache as `CartScreen` — confirmed by reading each call site; cannot be confirmed *at runtime* without booting the app.
- **Dependency merge**: `apps/mobile/package.json` has exactly one entry each for `@tanstack/react-query`, `react-native-razorpay`, `expo-secure-store` — no duplicates existed. `npm install` completed cleanly (1156 packages, 0 peer-dependency/resolution errors).
- **`npx tsc --noEmit`**: 0 errors, run after every change in this task (confirmed clean both mid-way and at the end).
- **`npx expo-doctor`**: 16/17 checks passed. The one failure (unrecognized `newArchEnabled` in `app.json`'s schema) was investigated and is a false positive — `expo-doctor@1.20.4`'s bundled schema lags the installed `expo@51.0.39`; `npx expo config --type public` resolves the field correctly as a real SDK 51 config key. Left `app.json` unchanged.
- **Navigator wiring**: `CatalogStackNavigator`, `CartStackNavigator`, `AccountStackNavigator`, `RootTabNavigator` already imported the real feature screens (not placeholders) when this task started; confirmed by reading all four files start-to-finish. No changes needed here beyond the cross-feature TODO wiring listed below.
- **Cross-feature TODOs wired and read through end-to-end at the source level** (not runtime):
  - `ProductDetailScreen` "Add to cart" → `useCart().addLine()` with variant id, gift wrap, and gift message passed through.
  - `ShippingScreen` → `useCart()`'s real `totals.subtotalMajor`/`totals.itemCount` instead of hardcoded `0`/`1`.
  - `ConfirmationScreen` → `useCart().clear()` (best-effort) and `useLocalOrderHistory().track({orderId, orderNumber, placedAt})`.
- **Nav param naming (`category` vs. `categoryId`)**: confirmed, by grepping every `navigate('ProductList', ...)` call site, that `HomeScreen.tsx` is the only caller and it never passes `category` — so `ProductListScreen`'s existing `category`→`categoryId` treatment has no second, inconsistent caller anywhere in the app.
- **`CartLineIssue` real-shape handling (TASK-04 discrepancy #2)**: re-confirmed `cartErrorMessage.ts`/`CartScreen.tsx` render cart-invalid errors as a cart-wide banner and never reference the stale `.lineId` field.

### Explicitly NOT verified in this sandbox (needs a real device + live `apps/mercato` backend)

- FEAT-001/002 (catalog/occasions): browse, filter, open a product, select a variant, price update — never run on a booted app.
- FEAT-003 (cart): add gift-wrapped item with message, change quantity, remove a line, cart survival across app restart — never run.
- FEAT-004 (checkout): full guest Razorpay checkout, Confirmation screen showing the real order, declined-payment retry not duplicating the order — never run. In particular, TASK-07's own flagged item (whether `providerData.razorpayOrderId`/`amountMinor` are the actual field names the live backend returns) is still unverified.
- FEAT-005/006 (account/orders): just-placed order appearing under Account → Orders, address-book sign-in gate — never run against a live backend, though the code path (local-history `track()` + `getOrder()` re-fetch) was read through and is structurally sound.
- All 4 TASK-04 wire-shape discrepancies (`catalog.ts` taxRate default, `cart.ts` CartLineIssue shape, `orders.ts` optional payment/shippingAddress, `payments.ts` confirm-response shape) — still only verified as "won't crash on the documented defaults," not re-checked against a live response.
- `EXPO_PUBLIC_ORG_ID`/`EXPO_PUBLIC_ORG_SLUG`/a real Razorpay test Key ID were not supplied — no `.env` file exists (only `.env.example`), so the app would refuse to start today per TASK-03's env validation. This is expected (no secrets fabricated) but blocks any real device test until a human fills it in.
- The app itself has never been booted via `expo start` + a simulator/device, in this task or any prior one.

**Bottom line**: everything that can be checked by reading code and running `tsc`/`npm install`/`expo-doctor` without a network/device is done and passes. Everything that requires an actual running `apps/mercato` backend, a Razorpay test key, and a simulator/device remains open and is not being claimed as verified.
