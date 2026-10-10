# Mobile Implementation — Review Notes & Open Items

Living document. Every deviation, discrepancy, ad-hoc dependency addition, or thing that needs re-verification against a **live** backend, surfaced by any of the 9 task agents, gets logged here as it happens — so nothing gets lost by the time TASK-09 (final integration) runs. Read this before TASK-09 and before any real device/backend test.

**Status: wave 1 (TASK-01–04) and wave 2 (TASK-05–08) complete. TASK-09 (final integration) also complete — see its section at the bottom.**

---

## Wave 1

### TASK-01 — Expo scaffold
- **Verified**: `npm install` succeeded (1151 packages, Expo SDK 51.0.0). `npx tsc --noEmit` clean. `npx expo config --type public` resolves. Did **not** run `expo start`/a simulator — no device/emulator available in this sandbox, so the app has never actually been booted. **→ Needs a real device/simulator smoke test before trusting the nav graph fully.**
- **Addition beyond spec**: added `.gitignore` (not in the task's file list, but standard/harmless — keeps `node_modules` out of git).
- **Addition beyond spec**: added an extra `CartStackParamList` in `src/navigation/types.ts`, beyond the four param-lists the task file specified, to satisfy the "Cart screen pushes Address" placeholder-navigation acceptance criterion. Documented inline as non-contract. **→ TASK-09 should confirm TASK-07 (checkout) actually wires against this, not a different assumption.**

### TASK-02 — Design system
- **No deviations.** All 9 files match the task file's contracts exactly, verified by the agent against the spec text directly.

### TASK-03 — API client core
- **Addition beyond spec**: `env.ts` throws at startup if `razorpayKeyId` is missing, even though the task file only mandated throwing for missing `apiBaseUrl` / missing-both `organizationId`+`orgSlug`. Rationale: `AppEnv.razorpayKeyId` is typed as a required `string`; leaving it unvalidated would let it be silently `undefined` at runtime. **→ This means the app will refuse to start at all until `EXPO_PUBLIC_RAZORPAY_KEY_ID` is set in `.env` — intentional, but make sure whoever runs this for the first time knows that, since nothing else in this app failing to start would otherwise point there.**
- **Verified thoroughly**: standalone `tsc --noEmit`, a Node smoke test against a stubbed `fetch` covering every acceptance criterion (money conversion, query-param injection, Idempotency-Key gating, both backend error-envelope shapes normalizing into `ApiError`), and a full-project `tsc` pass once TASK-01/04's real files landed.

### TASK-04 — API client domains
Four wire-shape discrepancies found between the task file's documented contract (written from earlier research) and the **actual, re-verified** storefront source code. All were resolved defensively (safe defaults) rather than guessed — but every one of these is a **live-backend verification item**, not settled fact:

1. **`catalog.ts` — `pricing.taxRate`**: the contract requires it; the real backend's `wirePricingSchema` has no `tax_rate` field at all. Currently defaults to `0`. **→ If tax actually varies by product, prices/totals shown on mobile will be wrong until this is re-checked against a live catalog response.**
2. **`cart.ts` — `CartLineIssue` shape**: contract said `{lineId, code, message}`; the real `422 cart_invalid` detail shape is `{index, productId, variantId, code, maxLength}` — **no `lineId` field exists at all**. The type was declared as the contract specified, but no parser was built for it (there's nothing real to parse into it). **→ Any UI that tries to map a cart validation error back to a specific line by `lineId` (e.g. TASK-06's per-line error display) will not work as written — needs to key off `index`/`productId`/`variantId` instead. Check this specifically when TASK-06's report comes in.**
3. **`orders.ts` — `OrderDetail.payment` / `.shippingAddress`**: contract marks these non-optional; the real `fullOrderWireSchema` for `GET /orders/{id}` doesn't include either field (the web storefront UI never reads them back). Currently optional with safe defaults. **→ TASK-08's `OrderDetailScreen` (shows "delivery method, totals, gift details") may not actually have a shipping address or payment status to display — re-verify against a live order detail response before assuming the screen is complete.**
4. **`payments.ts` — Razorpay confirm response**: contract said `{transactionId, paymentId, status, synced}`; the real backend's `confirmResponseSchema` only loosely validates `{ok?, status?}`, and the web storefront's own caller never reads `paymentId`/`synced` back. Implemented per the task file's documented shape with safe defaults when fields are absent. **→ TASK-07's checkout success/failure branching must not hard-depend on `paymentId`/`synced` being present.**

**Action for TASK-09 (or before)**: re-run TASK-04's module against an actual running `apps/mercato` dev server (not just static types) and correct any of the four items above that turn out to matter in practice.

---

## Wave 2 (in progress — placeholders below, filled in as each agent reports)

### TASK-05 — Catalog feature — ✅ DONE
- **Files**: `lib/queryClient.tsx` (own local `QueryClient`/`CatalogQueryProvider` — app-wide provider is TASK-09's job over `App.tsx`), `constants.ts` (`RECIPIENT_TYPES`/`SORT_OPTIONS` — recipient codes hardcoded from reading `apps/mercato/src/modules/gift_catalog/lib/constants.ts`'s `GIFT_RECIPIENT_TYPES` directly, since no storefront endpoint lists them — good cross-check, not a guess), `hooks/{useOccasions,useCategories,useProducts,useProductDetail}.ts`, `components/{OccasionTile,ProductCard,FilterChip,ProductFilters}.tsx`, `screens/{Home,ProductList,ProductDetail}Screen.tsx`.
- **New discrepancy found — nav param naming mismatch**: `CatalogStackParamList['ProductList']` (from TASK-01) names its param `category` (string), but TASK-04's `ProductListParams` names the matching query field `categoryId`. TASK-05 treats `route.params.category` as a category *id* since there's no other identifier on that route — flagged in a code comment for TASK-09 in case anything else (e.g. a deep link, or TASK-09's own final nav wiring) was expecting a slug there instead. **→ TASK-09 must confirm this assumption holds across the whole app, not just within TASK-05's own screens.**
- **Dependency added**: `@tanstack/react-query@^5.59.0` was missing, so this agent added it to `package.json` itself (resolved to `5.104.1` via `npm install`) — confirms it was already present when TASK-06 also needed it (see Dependency table below — no conflict found).
- **Add-to-cart TODO confirmed left in place**: `ProductDetailScreen`'s add-to-cart button is a marked `// TODO(TASK-09): wire to useCart().addLine()` stub (disabled while gift message exceeds max length) — `useCart()` didn't exist yet when this screen was written. **TASK-09 must wire this.**
- **⚠️ Conflicting typecheck status vs. TASK-08's report**: TASK-05 reports `npx tsc --noEmit` returns **zero errors app-wide**, "confirmed twice, including after TASK-06's concurrent changes landed." TASK-08's report (which ran earlier) found **2 errors in `src/features/cart/lib/cartErrorMessage.ts`**. These can't both be taken at face value — likely just a timing difference (TASK-06 may have fixed the errors between the two checks), but **do not assume it's resolved; run `tsc --noEmit` directly once TASK-06's report lands, and again right before TASK-09 starts, rather than trusting either agent's self-report.**

### TASK-06 — Cart feature — ✅ DONE
- **Files**: `hooks/useCart.ts`, `components/CartLineRow.tsx`, `lib/cartErrorMessage.ts`, `lib/queryClient.tsx`, `screens/CartScreen.tsx` (overwritten). `package.json` not touched by this agent.
- **Discrepancy #2 (CartLineIssue shape) — resolved correctly, not just worked around**: did *not* trust the stale `{lineId,code,message}` type still exported from `cart.ts`; defined a local `RealCartLineIssue` matching the actual wire shape `{index,productId,variantId,code,maxLength}`. Since `index`/`productId` can't be reliably mapped back to a specific `CartLine.id` without a live response to confirm ordering, issues render as a **cart-wide banner**, not per-line — a deliberately conservative choice over guessing. **→ Worth a live check: if the backend's `lines[]` order is stable and matches `index` 1:1, a per-line attribution could be added later; don't treat the banner-only approach as a dead end.**
- **Resolves the earlier tsc conflict**: TASK-06 itself now reports `npx tsc --noEmit` → zero errors. Treat TASK-08's earlier "2 errors in cartErrorMessage.ts" report as stale (it ran mid-flight, before this task finished) — **no longer an open item**.
- **🔴 NEW, IMPORTANT cross-task finding — fragmented QueryClient**: there is **no app-wide `QueryClientProvider`** in `App.tsx` (that's TASK-09's job, not yet done). TASK-05 (catalog) and TASK-06 (cart) each built their *own* local `QueryClient` singleton (`catalogQueryClient`, `cartQueryClient`) as a stand-in so their screens work standalone. **This means right now the catalog cache and cart cache are two separate, unsynchronized React Query clients.** TASK-09 **must**: hoist one shared `QueryClientProvider` above `RootTabNavigator` in `App.tsx`, and have every feature (catalog, cart, and whatever checkout did) use that single client instead of its own local one — otherwise `useCart()` called from TASK-05's product-detail "add to cart" button or TASK-07's checkout screen will either crash ("No QueryClient set") or silently split the cache. **This is the single most important integration item for TASK-09 — bigger than the dependency-merge step.**
- **New minor discrepancy**: cart's gift-message length validation uses a hardcoded `DEFAULT_GIFT_MESSAGE_MAX_LENGTH = 250` because `CartLine` doesn't carry the per-product `giftMessageMaxLength` that TASK-05's catalog/product-detail data has. **→ A product with a shorter real limit (set in its gift profile) could show as valid in the cart screen even though the backend will reject it as `cart_invalid`.** Worth reconciling (e.g. carry the limit through `addLine`'s input, or have `CartScreen` look it up) rather than leaving two different sources of truth for the same limit.
- **Acceptance criteria confirmed**: optimistic updates with rollback on all 5 mutations, independent per-line gift wrap/message, merge-not-duplicate (relies on backend, not fought client-side), empty-cart CTA navigates to the sibling Products tab correctly across stack boundaries.

### TASK-07 — Checkout feature — ✅ DONE (wave 2 complete)
- **Files**: `hooks/useCheckoutSession.ts` (new — module-level store via `useSyncExternalStore`, deliberately *not* React Context since a Context Provider would mean editing `CartStackNavigator.tsx`, outside this task's boundary), `components/AddressForm.tsx` (reuses `addressSchema` from `addresses.ts`, not `checkout.ts` — plus a separate email-only zod check since email isn't in that schema), `screens/{Address,Shipping,Payment,Confirmation}Screen.tsx` (overwritten), `types/react-native-razorpay.d.ts` (new ambient module decl — the package ships no types).
- **ParamList used**: `CheckoutStackParamList`, typed consistently, mounted via the real `CartStackNavigator.tsx` (resolves the open question from TASK-01/05's notes above).
- **Razorpay mapping — correctly deviated from the task file's speculative snippet, with justification**: the task file guessed `order_id: paymentSession.sessionId`. This agent instead found (by reading the **live-verified** `apps/storefront/src/lib/api/payments.ts`) that the real Razorpay `order_id` is `providerData.razorpayOrderId` (fallback `providerData.orderId`) — `sessionId` is a different, internal value. Same for amount: prefers `providerData.amountMinor`/`.amount` (already paise) over computing `toMinorUnits(grandTotalMajor)`, falling back to the computed value only if `providerData` is absent. `key` is always `env.razorpayKeyId` only, never from the response — correct per the security rule. **→ Still explicitly flagged by the agent itself as unverified against a real mobile backend call — this is the single highest-value thing to check first on a live device/backend test, since a wrong field name here means the whole payment flow silently breaks.**
- **Idempotency handled correctly**: one key generated per checkout session, reused across retries/network errors, only rotated on explicit "Continue shopping"/restart — not on error-retry. `openPaymentSession`/`confirmRazorpayPayment` each get their own fresh key per call, per spec.
- **Declined-payment retry**: correctly uses `openPaymentSession` on the existing order, not a new `placeOrder`.
- **Ambiguous-failure handling**: 5xx/network errors during order placement direct the user to check Order history rather than auto-retrying — matches the spec's safety requirement around not leaving the user unsure whether they were charged.
- **`ConfirmationScreen` reads `getOrder()`** (from `orders.ts`) for line items, since `PlacedOrder` (from `checkout.ts`) has none — a read-only cross-import, not a modification of `lib/api/**`.
- **Dependency added**: `react-native-razorpay@^2.3.0` to `package.json` (per this run's explicit instruction overriding the task file's static "do not touch" — expected and consistent, not a conflict). Not actually installed (no network in sandbox) — typechecks only via the ambient `.d.ts`.
- **Two TODOs left for TASK-09 to wire** (both `useCart()` and `useLocalOrderHistory()` didn't exist yet when this agent ran, even though they exist *now*): cart subtotal/itemCount in `ShippingScreen.tsx` (needed for the shipping-methods query), and cart-clear + `track()` call in `ConfirmationScreen.tsx`. **These are not optional polish — without them, the cart never empties after a successful order and the order never appears in local history.**
- `npx tsc --noEmit` passes with 0 errors (confirmed all new files, including the ambient `.d.ts`, were actually compiled via `--listFiles`).
- **Explicitly not verified** (no backend reachable in sandbox): idempotent-replay behavior, and the Razorpay `providerData` field-name guesses above.

---

## Wave 2 complete. All of TASK-01–08 are now implemented. Proceeding to TASK-09 (final integration).

### TASK-08 — Account/Orders feature — ✅ DONE
- **Files**: `features/orders/hooks/useLocalOrderHistory.ts` (new — SecureStore-backed, dedupes by `orderId`, caps 25, race-safe against an early `track()` call), `features/account/screens/{AccountScreen,AddressesScreen}.tsx` (overwritten), `features/account/components/AddressForm.tsx` (new), `features/orders/screens/OrderDetailScreen.tsx` (overwritten).
- **Discrepancy #3 handled correctly**: `OrderDetailScreen` only calls `getOrder(orderId)` and renders whatever comes back (lines, address, status/payment badges) — since TASK-04 already made `payment`/`shippingAddress` optional with safe defaults, this screen won't crash if they're absent on the real wire; it just won't show them. **Still worth a live check**: confirm the screen doesn't show a misleadingly-blank delivery section when the field actually exists but is empty vs. genuinely absent.
- **401 gating confirmed correct**: `AddressesScreen` shows the sign-in gate only on `ApiError.status === 401`; any other error (network, 500, etc.) gets the generic retry UI instead — exactly the distinction the task file asked for.
- **`listMyOrders()` confirmed never called** — matches the non-goal.
- **Dependency added**: `expo-secure-store@~13.0.2` (SDK-51-matched version), installed successfully. Report notes `@tanstack/react-query` was *already* in `package.json` by the time this agent read it (added by a concurrent cart/catalog agent) and `npm install` merged cleanly — no conflict.
- **New signal**: this agent's `tsc --noEmit` run found **2 remaining errors project-wide**, both in `src/features/cart/lib/cartErrorMessage.ts` — outside its boundary, left untouched. **→ This is almost certainly TASK-06 hitting discrepancy #2 (the `CartLineIssue` shape mismatch) head-on. Check TASK-06's own report for this, and do not assume it's fixed until confirmed.**
- `useLocalOrderHistory` is confirmed ready for TASK-07 to call `track({orderId, orderNumber, placedAt})` from `ConfirmationScreen` with no further changes on this side.

---

## Dependency additions made ad-hoc (outside TASK-01/09's normal ownership)

Several task files explicitly allowed an agent to add its own dependency to `package.json` early (to typecheck), with instructions to flag it here for TASK-09 to dedupe/confirm rather than double-add:

| Package | Added by | Confirmed in package.json? |
|---|---|---|
| `@tanstack/react-query` | TASK-05 and/or TASK-06 (both were told to add it if missing) | _TASK-09 must check for duplicate/conflicting version specs if both touched it independently_ |
| `react-native-razorpay` | TASK-07 (if not already present) | _pending confirmation in TASK-07's report_ |
| `expo-secure-store` | TASK-08 (if not already present) | _pending confirmation in TASK-08's report_ |

**TASK-09 must open `apps/mobile/package.json` directly and verify the final dependency list once, rather than trusting any single agent's self-report — multiple agents editing the same file concurrently (even if each intended to only add one line) is the one real collision risk in this whole plan.**

---

## Things that cannot be verified in this sandbox (no device/simulator, likely no network to npm/Expo Go)

- The app has never actually been booted (`expo start` + a simulator/device). All verification so far is `tsc --noEmit` + static reasoning.
- `react-native-razorpay`'s native module cannot be linked/tested here — only its TypeScript types were checked.
- End-to-end checkout against a **live** `apps/mercato` backend (idempotency replay, real Razorpay test-key flow, actual wire shapes for the 4 discrepancies above) has not happened yet. TASK-09's "Manual QA pass" section is where this must finally happen, on a machine with a simulator and the backend running.
- `EXPO_PUBLIC_ORG_ID`/`EXPO_PUBLIC_ORG_SLUG` still has no real value anywhere — `.env.example` documents the requirement but nobody has filled in the actual tenant/org UUID from `apps/storefront/.env` (not committed). **The app will fail at runtime (by TASK-03's env validation) until someone supplies this.**

---

## Full checklist to run before calling this "done"

- [x] **Hoist one shared `QueryClientProvider` in `App.tsx`** and migrate catalog/cart (and checkout, once its report lands) off their own local stand-in clients — see Wave 2 / TASK-06 note above. Highest-priority integration item. **DONE by TASK-09**: single `queryClient` in `src/lib/queryClient.ts`, mounted in `App.tsx` above `NavigationContainer`/`RootTabNavigator`; the two local stand-in files (`src/features/catalog/lib/queryClient.tsx`, `src/features/cart/lib/queryClient.tsx`) deleted; `HomeScreen`, `ProductListScreen`, `ProductDetailScreen`, `CartScreen` no longer wrap themselves in a local provider.
- [ ] Re-verify all 4 TASK-04 wire-shape discrepancies against a live `apps/mercato` response. **Still open** — no network/backend in this sandbox. Confirmed all 4 remain clearly flagged in code comments (`catalog.ts` taxRate, `cart.ts` CartLineIssue shape, `orders.ts` payment/shippingAddress optionality, `payments.ts` confirm response shape) and that the app does not crash on their documented-safe defaults (verified via `tsc --noEmit` and static read-through only, not a live call).
- [x] Confirm `package.json`'s final dependency list has no duplicate/conflicting entries from wave-2 agents. **DONE**: opened `apps/mobile/package.json` directly — exactly one entry each for `@tanstack/react-query` (`^5.59.0`), `react-native-razorpay` (`^2.3.0`), `expo-secure-store` (`~13.0.2`); no duplicates were ever present to merge. `npm install` re-run clean (1156 packages audited, 0 peer-dependency errors; only an unrelated low/moderate/high vulnerability audit summary, not a resolution failure).
- [ ] Fill in the real `EXPO_PUBLIC_ORG_ID`/`ORG_SLUG` and a Razorpay test Key ID in `apps/mobile/.env` (never the secret). **Still open** — requires a human to supply real tenant values from `apps/storefront/.env`; no `.env` file exists in the tree (only `.env.example`), correctly uncommitted. TASK-09 did not fabricate placeholder values.
- [ ] Boot the app on an actual simulator/device at least once — this sandbox never did. **Still open** — no simulator/device/network-to-Expo-Go available in this sandbox. `npx tsc --noEmit` (0 errors) and `npx expo-doctor` (see below) are the only checks possible here.
- [ ] Run TASK-09's full manual QA checklist against FEAT-001–006 with a real backend. **Still open for the live parts** — see TASK-09's own `## QA Results` section in `TASK-09-integration-navigation.md` for what was verified statically (code-reading/typecheck) vs. what genuinely needs a device + `apps/mercato` dev server.
- [x] Confirm TASK-07's checkout screen ended up using the correct `ParamList` (see Wave 2 note above). **Confirmed**: `CartStackNavigator.tsx` mounts `Cart`, `Address`, `Shipping`, `Payment`, `Confirmation` against `CartStackParamList` (`{Cart: undefined} & CheckoutStackParamList`); all four checkout screens are typed against `CheckoutStackParamList` directly, exactly as TASK-01's non-contract note anticipated. No second/competing navigator was introduced.
- [x] Confirm the `CartLineIssue` real shape (discrepancy #2) is handled correctly wherever cart validation errors are displayed. **Confirmed, re-checked**: `src/features/cart/lib/cartErrorMessage.ts` and `CartScreen.tsx` render cart-invalid errors as a cart-wide banner (via `cartErrorMessage`), never attempting to key off the stale `.lineId` field — this was already correct going into TASK-09 and nothing in the integration work (shared QueryClient, add-to-cart wiring) changed that path. Still a live-backend item only in the sense noted by TASK-06 (whether `index`-based per-line attribution could later be added) — not a bug.

---

## TASK-09 — Integration — DONE

Ran strictly after TASK-01–08. Scope per `spec/mobile/tasks/TASK-09-integration-navigation.md`: shared QueryClient, dependency merge, cross-feature TODO wiring, nav-param consistency check, typecheck/`expo-doctor`, manual QA pass (sandbox-limited).

### Fixes made

1. **Shared `QueryClientProvider`** (highest-priority item): created `apps/mobile/src/lib/queryClient.ts` exporting one `queryClient` (`retry: 1`, `staleTime: 30_000`). Mounted it in `apps/mobile/App.tsx`, wrapping `SafeAreaProvider`/`NavigationContainer`/`RootTabNavigator`. Deleted `src/features/catalog/lib/queryClient.tsx` (`catalogQueryClient`/`CatalogQueryProvider`) and `src/features/cart/lib/queryClient.tsx` (`cartQueryClient`/`CartQueryProvider`) entirely. Removed the now-redundant local-provider wrapper from `HomeScreen.tsx`, `ProductListScreen.tsx`, `ProductDetailScreen.tsx` (catalog) and `CartScreen.tsx` (cart) — each screen's default export is now the content component directly, relying on the app-wide provider. Verified by grep: the only `QueryClientProvider` JSX instantiation left in the tree is in `App.tsx`.
2. **ProductDetailScreen add-to-cart wired**: replaced the `// TODO(TASK-09)` stub with a real `useCart().addLine({ productId, variantId: selectedVariant?.id, quantity: 1, giftWrap, giftMessage: giftMessage || undefined })` call, including loading state on the button (`loading={isAdding}`), an inline success message, and an inline error message (`theme.colors.danger`) on failure. Gift wrap toggle and gift message text are passed through exactly as entered.
3. **ShippingScreen wired to real cart totals**: replaced the hardcoded `cartSubtotalMajor = 0` / `cartItemCount = 1` placeholders with `useCart()`'s `cart?.totals.subtotalMajor` / `cart?.totals.itemCount`, and added both to the `load` callback's dependency array so shipping methods re-quote once the cart finishes loading (removed the `eslint-disable-next-line react-hooks/exhaustive-deps` that masked the missing deps).
4. **ConfirmationScreen wired**: on load, now calls `useCart().clear()` (best-effort — a failure doesn't block the order confirmation UI, since the order itself is already placed) and `useLocalOrderHistory().track({ orderId, orderNumber: order?.orderNumber || orderId, placedAt: new Date().toISOString() })`, so the cart actually empties and the order shows up under Account → Orders after a real checkout.
5. **Dependency merge**: verified directly in `package.json` — single, non-conflicting entries for `@tanstack/react-query@^5.59.0`, `react-native-razorpay@^2.3.0`, `expo-secure-store@~13.0.2`. `npm install` re-run: 1156 packages, 0 resolution/peer-dependency errors (only the standard `npm audit` vulnerability count, unrelated to dependency conflicts).
6. **Nav param naming (item e)**: grepped every `navigate('ProductList', ...)` call site — only `HomeScreen.tsx`, and it only ever passes `occasion` (never `category`). No second caller passes `category`/`categoryId` inconsistently, and `ProductListScreen.tsx`'s existing treatment of `route.params.category` as a category id remains the only consumer. Nothing to change; the existing inline comment flagging this for future deep-link work was left in place.
7. **Navigator wiring**: `src/navigation/**` was already pointing at the real feature screens (not placeholders) by the time this task ran — `CatalogStackNavigator`, `CartStackNavigator`, `AccountStackNavigator`, `RootTabNavigator` all import from `src/features/{catalog,cart,checkout,account,orders}/screens/*` directly. No placeholder-screen imports remained to replace; confirmed by reading all four navigator files.
8. **TASK-04 wire-shape discrepancies**: all 4 remain exactly as wave-1 left them — documented inline in `catalog.ts`, `cart.ts`, `orders.ts`, `payments.ts` with safe defaults and "re-verify against a live backend" comments. **Not independently re-verified against a live `apps/mercato` server in this sandbox** (no network/backend reachable) — this is explicitly called out as still open, not silently resolved.
9. **Typecheck**: `npx tsc --noEmit` → 0 errors, run after all of the above changes landed.
10. **`expo-doctor`**: ran successfully (network was available for this one install). 16/17 checks passed. The 1 failure — "Check Expo config (app.json/app.config.js) schema" flags `newArchEnabled` as an unrecognized additional property — was investigated and determined to be a false positive from `expo-doctor@1.20.4`'s bundled config schema lagging the installed `expo@51.0.39`: `npx expo config --type public` resolves `newArchEnabled: false` cleanly as a recognized SDK 51 field, and it is Expo's own New Architecture opt-in flag, not a stray/typo'd key. Left `app.json` unchanged rather than removing a legitimate field to silence a known-stale linter check.

### Still open (needs a real device/backend — not resolved by this task, by design)

- Live re-verification of the 4 TASK-04 wire-shape discrepancies against an actual `apps/mercato` response.
- The Razorpay `providerData` field-name mapping in `useCheckoutSession`/`PaymentScreen` (TASK-07's own flagged item) — unverified against a real mobile backend call.
- Idempotent-replay behavior on `POST /checkout/orders` under a real retry.
- `EXPO_PUBLIC_ORG_ID`/`EXPO_PUBLIC_ORG_SLUG`/a Razorpay test Key ID being filled into a real (uncommitted) `.env` — still blank; the app will refuse to start until a human supplies these (per TASK-03's env validation).
- Booting the app on an actual simulator/device — never done in any task's sandbox, this one included.
- The full manual QA checklist (FEAT-001–006) against a live backend — see TASK-09's own QA Results section for the static/sandbox-only pass that substitutes for it here.
