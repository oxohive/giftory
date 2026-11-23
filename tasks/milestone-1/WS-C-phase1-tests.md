# WS-C — Phase 1 backend unit tests

Branch: `m1/ws-c` (based on `milestone-1-hardening`). Not pushed.

## Status

**Done.** Phase 1 backend test coverage went from 11 suites / 113 tests to **26 suites / 381 tests** (379 passing, 2 `it.todo`). All new tests are deterministic unit tests: no database, no network, no Stripe/Razorpay calls. They mock the ORM, providers and network the same way the Phase 2 tests do.

I found **one real bug** and fixed it (small, display-only rounding fix, test written first). I recorded **two design gaps** as `it.todo` instead of changing code, because they are not reachable today and fixing them needs a product decision or a wider change. Details are under "Bugs found" and "Risks".

Gates (run in `apps/mercato`, in this worktree):

| Gate | Result |
|---|---|
| `yarn test` | 78 / 79 suites pass; 903 passed, 2 todo, **1 failed** = the known Windows-only `commissions/components/__tests__/snapshotsAreReadOnlyInTheUi.test.ts` path-separator failure (WS-D owns it) |
| `yarn typecheck` | 147 errors, the **same 147 as the baseline** (I diffed the full error list: identical). No new errors. |
| `yarn lint` | exit 0, 0 errors, 9 warnings, all pre-existing and none in the files I touched |

## What changed (files and why)

### New test files

| File | What it proves |
|---|---|
| `apps/mercato/src/modules/storefront/__tests__/money.test.ts` | `toMinor`/`fromMinor`: every value from ₹0.00 to ₹20,000.00 converts to the exact paise; large values round-trip; float noise (0.1+0.2) is absorbed; half a paisa rounds up; `toNumberOrNull` never returns NaN; totals stay in whole paise; tax can never go negative. |
| `storefront/__tests__/cart.test.ts` | Server-side cart (FEAT-003): an anonymous cart is created with an httpOnly cookie and only the token hash is stored; lookup is by token hash **inside the tenant and organization**; another tenant's or organization's cart is never returned for the same token; on login the shopper adopts an anonymous cart or merges it (identical lines add up, capped at 20); another customer's cart is never adopted; adding the same product + variant + gift options increments the quantity; the cart is limited to 50 lines; a unique-violation race is retried once; update, fold-into-twin, remove and clear (soft delete); `replaceCartLines` is validated first and runs in a transaction; the cart view is re-priced and unavailable lines carry an issue code; `markCartConverted`. |
| `storefront/__tests__/catalogReprice.test.ts` | `repriceLines` (prices come from the catalog only): uses the INR `regular` list price, ignores client prices; every query is scoped to tenant + organization; another organization's product, an inactive product or a deleted product is `product_unavailable`; `quote_only`; `price_unavailable` (only USD, targeted, expired or wholesale prices exist); variant price beats product price; falls back to the default variant; `variant_required`; `variant_unavailable`; min/max/step quantity rules; the gift profile message limit, gift wrap availability and the defaults when a product has no profile (no wrap, 250 characters); gift message normalisation. `listCatalogProducts`: a malformed `ids` filter never widens the result; `giftOnly`; an occasion with no matches; price filter and sort; LIKE wildcards are escaped. |
| `storefront/__tests__/checkout.test.ts` | `placeOrder` / `retryOrderPayment` (FEAT-004), using an in-memory checkout ledger. Validation runs before any write (return-URL allowlist, empty cart, catalog issues, unknown shipping method). The sales order is created inside the resolved shop with server prices, gift metadata, the shipping adjustment and a system context pinned to the organization. The ledger stores **integer paise** (`'99800'`, `'4900'`, `'104700'`). The gateway gets **decimal major units** (`amount: 1047`) and a stable idempotency key `storefront-checkout:<checkoutId>`, and `{orderId}` is substituted in the success URL. Also covers the guest access cookie (only its hash is stored), the order-placed event, and a CRM linking failure that must not block the order. Stripe: the provider is passed through and the redirect URL is surfaced. Signed-in customer flow. Inline sync when a session comes back already captured. **Idempotency-Key**: replaying with the same key + body returns 200 with the same order and session and no second order; a replay ignores later catalog changes; a different body → 409 `idempotency_key_reused`; a different customer → 409; a concurrent request → 409 `checkout_in_progress` + `retry-after`; a stale claim is taken over; the same key in another organization is independent; a failed order creation releases the claim; an order left by a crashed attempt is reused. **Payment failures**: 502 `payment_session_failed` keeps the order and the guest cookie; a provider 4xx → 422; retrying the same key reuses the order and opens a new session; an already-paid order → 409. **Retry route**: 404 with no existence oracle; 409 once money is taken; a new session on the same order, with totals in paise and guest access kept; replay; an order-placement key cannot be reused for a retry; the provider can be switched; the return URL is checked first. |
| `storefront/__tests__/paymentSync.test.ts` | Payment confirmation (FEAT-004 req. 7): the checkout lookup is scoped; the transaction state is re-read from the gateway service, not taken from the event. A capture records **exactly one** sales payment (captured amount, else authorized amount; reference `provider:txn`; currency upper-cased) and confirms the order. **Duplicate or replayed deliveries never record a second payment.** A concurrent claim is respected; the claim is released when recording fails, so a retry can record it. A status that staff set is not overwritten. `authorized` confirms the order without recording a payment; `failed`, `cancelled` and `canceled` are mapped; a missing dictionary entry is skipped. Refunds: an existing payment is marked refunded, and a first-seen refund records the payment first. All five `payment_gateways.payment.*` subscribers are persistent, ignore payloads without scope, and rethrow so the event is retried. |
| `storefront/__tests__/orders.test.ts` | Order access (FEAT-006): visible to the customer who placed it, the customer's linked CRM person, or a guest with the matching token; hidden from other customers; one order's guest token never opens another; another organization's order is hidden **even from its owner**; ledger rows of another organization are ignored; soft-deleted orders are hidden. `resolveRequester`. Order detail serialization (totals, gift options, addresses, payment status, `pending_payment` / `payment_failed`). Order history: empty for guests; own orders + CRM person orders only; every query scoped. Also the **regression test for the rounding bug** below. |
| `storefront/__tests__/routes.test.ts` | HTTP layer: shop resolution failure → 400/404 without running the handler; `StorefrontError` mapping with cookies (httpOnly) and headers; Zod → 422; `CrudHttpError` mapping; unexpected errors → 500 **without leaking the message, table names or tenant id**. `POST /checkout/orders`: the `Idempotency-Key` header is required and malformed keys are rejected; malformed JSON → 422; an invalid PIN code or a non-Indian mobile → 422; the key is trimmed; payload `tenantId`/`organizationId`/`customerUserId` are dropped; 201/200. Payment-session route: a non-UUID id → 404, the key is required, an unknown provider → 422. `GET /orders` requires sign-in. `GET /orders/{id}` returns the same 404 for malformed, unknown and forbidden ids. Address book: 401 for guests on every method; reads and writes use the session owner and ignore the body; PIN/phone/country validation. Cart line routes: 404 for a bad id or no cart; quantity bounds. |
| `storefront/__tests__/addresses.commands.test.ts` | The real registered address commands, run through `commandRegistry` (FEAT-005 req. 5): they refuse to run without a storefront system context; they refuse an owner from another organization (403); the owner must be valid; the first address becomes the default; only one default per customer; another customer's default is never touched; the 50-address cap; partial update; switching the default; another customer's address → 404; a deleted address → 404; soft delete that promotes the next address to default. Plus 1 `it.todo` (see Risks). |
| `storefront/__tests__/shipping.test.ts` | Shipping methods are scoped and limited to active INR (or no-currency) methods; decimal strings are mapped; the manual base-rate adjustment is rounded to paise, net never exceeds gross, and free or negative rates are skipped; provider-backed methods are quoted by the native calculator in the shop scope; an unknown provider key falls back to the base rate. |
| `storefront/__tests__/customerLink.test.ts` | Indian phone normalisation; name splitting; e-mail matching is case-insensitive and stays inside the shop; reuse before create; `customers.people.create` in a pinned system context; an existing link is returned as-is; an account in another shop → null; the native `personEntityId` is preferred; a concurrent link race goes to the winner; `readLinkedPersonId` never creates anything. |
| `apps/mercato/src/modules/gateway_razorpay/__tests__/confirm-route.test.ts` | `POST /api/gateway_razorpay/confirm`: public and rate-limited; malformed or injected payloads → 422 before any lookup; looks up only live Razorpay transactions by order id; no match → 401; the HMAC is verified with the **owning tenant's** key secret and the status is synced in that scope; forged signatures (wrong secret, swapped ids, a different payment) → 401 without leaking the secret or tenant; **a signature made with tenant B's secret only ever confirms tenant B's transaction**; missing or misconfigured credentials are treated as non-matching (even an HMAC with an empty key is rejected); Razorpay unreachable → 202 `synced:false`; a replayed confirmation only re-reads the provider and writes nothing itself. |
| `gateway_razorpay/__tests__/registration.test.ts` | DI registration: the adapter, the INR-only descriptor and the health check. The `razorpay` webhook handler is wired to the `razorpay-webhook` queue with a 256 KB body limit and a session-id hint; it rejects unsigned and forged bodies and accepts a correctly signed one. The worker delegates to the host `processPaymentGatewayWebhookJob` with the job container's services and propagates failures so the job is retried. |
| `gateway_razorpay/__tests__/client.test.ts` | Calls go only to the fixed origin, with Basic auth, `redirect: 'error'` and a timeout signal; ids are URL-encoded so they cannot change the request path; GETs are retried on network errors, 429 and 5xx (max 3 attempts); a POST is never retried, even after a timeout (no double charge); 4xx is not retried; a malformed body is flagged; the key secret never appears in errors; the health-check page size is clamped. |
| `apps/mercato/src/modules/gift_catalog/__tests__/commands.test.ts` | The real profile and occasion commands. `resolveCommandScope`: staff scope wins over payload scope; payload scope is honoured only for system actors; missing scope fails closed; an organization outside the allowed set → error; undo is refused across tenants/organizations. Profiles: the product must be in scope and not deleted (404); a second live profile → 409; a soft-deleted profile is revived instead of duplicated; message-length and vocabulary limits; partial update; another organization's profile → 404; a stale optimistic-lock version → 409; soft delete; undo of create. Occasions: codes are normalised; codes are unique per organization (the same code is allowed in another organization); revive; deactivation hides without deleting; renaming to a taken code → 409; another organization's occasion → 404; unsafe image URLs are rejected. |
| `gift_catalog/__tests__/storefront.test.ts` | `resolveStorefrontScope`: precedence is host > customer session > shop identifier; the tenant is always derived from the organization row; inactive, deleted or unknown shops → 404; the identifier must match the host or session (`shop_mismatch`); inactive domain mappings and resolver errors fall through. `listActiveOccasions`: only active, live occasions of the shop, in sort order (FEAT-002 req. 2). `listStorefrontProfiles`: occasion filter, the recipient filter includes `anyone` (US-001), hides profiles of inactive, deleted or other-organization products, never returns another organization's profiles, empty id list → no query, pagination and scan cap, public shape only. Public routes: 400/404/200/500 (no internals leaked), and a malformed `productIds` list matches nothing. Admin enricher: feature-gated, non-critical, one scoped query per page. |

### Production code changed (bug fix only)

| File | Change |
|---|---|
| `apps/mercato/src/modules/storefront/lib/orders.ts` | `money()` now uses `round2()` (that is, `toMinor`/`fromMinor`) instead of `Math.round(x * 100) / 100`, and the order-detail `subtotal` comes from `orderTotals(order).subtotal` instead of a hand-rolled float subtraction. See "Bugs found". |

### Commits (oldest first)

```
e725e1b test(storefront): cover paise conversion and server-side cart
1f28571 test(storefront): cover server-side catalog re-pricing and listing filters
014cc67 test(storefront): cover order placement, Idempotency-Key ledger and payment retry
a3d1843 test(storefront): cover payment sync, gateway subscribers and order access
940f9c8 test(storefront): cover HTTP layer, Idempotency-Key header and session-owned scope
21416d5 test(storefront): cover address book commands, shipping quotes and CRM linking
67e5879 test(gateway_razorpay): cover confirm route, webhook wiring/worker and client failure paths
378e111 test(gift_catalog): cover commands, storefront scope resolution, public reads and enricher
204ca82 test: fix new-test type errors and record two known gaps as it.todo
c8c29cc fix(storefront): round order detail amounts through toMinor/fromMinor
(+ the commit that adds this handoff file)
```

## Coverage table

| Module | Test files before → after | Tests before → after | Behaviours covered | Gaps that remain |
|---|---|---|---|---|
| `storefront` | 4 → 14 | 43 → 242 (2 todo) | Money conversion; cart (anonymous/customer, merge, de-duplication, gift options, limits, races, isolation); catalog re-pricing and listing filters; order placement + Idempotency-Key ledger; payment retry; payment sync + subscribers (duplicate/replay safety); order access + history; HTTP layer and error mapping; address book commands + routes; shipping; CRM linking | Catalog **read** routes (`GET /catalog/products`, `/products/{slug}`, `/categories`) are only covered through `listCatalogProducts`; `getCatalogProduct` (variants/media/gift block) has no direct test. The customer-account subscribers (`customer-user-created`, `customer-email-verified` → `linkVerifiedCustomer`) are untested. `PUT/DELETE /cart` routes are covered only through `lib/cart`. |
| `gift_catalog` | 1 → 3 | 8 → 49 | Command scope rules; profile + occasion create/update/delete/revive/undo; optimistic lock; storefront scope resolution; public occasion/profile reads + routes; admin enricher | Admin CRUD routes (`api/profiles`, `api/occasions` via `makeCrudRoute`: list filters, `buildFilters`); the CLI seeding (`cli.ts`, `lib/seeds.ts`, `lib/demoSeed.ts`); backend pages, widgets and UI components. |
| `gateway_razorpay` | 6 → 9 | 62 → 90 | (Existing: adapter, signatures, money, status map, webhook verification, credentials.) New: confirm route + per-tenant HMAC, DI/webhook registration, queue worker, client failure paths | `cli.ts`, `setup.ts`, the env preset beyond the existing tests, `widgets/payments/client.tsx` (browser widget). The host-side webhook route and processor (`payment_gateways`) belong to Open Mercato and are not app code. |
| Stripe | 0 app-owned files | n/a | Stripe is the upstream package `@open-mercato/gateway-stripe`. The app-owned Stripe behaviour is the storefront path, now tested: the provider key is passed through, the redirect URL comes from the client session, retry can switch Razorpay → Stripe, and provider-agnostic payment sync handles Stripe status events. | Stripe webhook signature verification and session creation live in the package (not app code) and are not unit-tested here. They are covered only by the package's own tests and by end-to-end runs with Stripe test keys. |
| `pricing.ts` (`toMinor`/`fromMinor`) | covered by `pricing.test.ts` → + `money.test.ts` | — | Exhaustive paise conversion, rounding, float noise, totals | — |

## Tests added — exact commands and results

From `C:\Users\danie\Gift-App-wt\ws-c\apps\mercato` (with the `node_modules` junction to the main checkout):

```bash
npx jest --config jest.config.cjs src/modules/storefront src/modules/gift_catalog src/modules/gateway_razorpay
# Test Suites: 26 passed, 26 total
# Tests:       2 todo, 379 passed, 381 total

yarn test
# Test Suites: 1 failed, 78 passed, 79 total
# Tests:       1 failed, 2 todo, 903 passed, 906 total
# The only failure is commissions/components/__tests__/snapshotsAreReadOnlyInTheUi.test.ts (known, Windows-only, WS-D).

yarn typecheck   # 147 errors, identical list to the pre-change baseline (diffed line by line)
yarn lint        # exit 0; 0 errors, 9 pre-existing warnings
```

As a sanity check, I temporarily broke production code three times (each change reverted immediately): I removed the tenant/org filter from the cart query, I dropped the idempotency `mismatch` check, and I stored the grand total in rupees instead of paise. Each time, the new tests failed (3, 2 and 2 failures respectively).

## Decisions made and reasoning

- **Mocking style.** I copied the Phase 2 pattern: `jest.mock` for `di/container`, `i18n/server`, `encryption/find` and entity modules, and real command handlers run through `commandRegistry` (as `commissions/subscribers/__tests__/snapshot-on-assignment.test.ts` does). For the cart, checkout, orders and gift_catalog tests I used small in-memory fake EntityManagers that apply the equality filters the production code sends. Tenant isolation is therefore tested by behaviour, not just by checking call arguments: if a query loses its `tenantId`/`organizationId` filter, the fake returns the other tenant's row and the test fails.
- **No shared test-helper file.** Jest's default `testMatch` treats every file under `__tests__/` as a test, and a helper outside `__tests__` could be picked up by module auto-discovery. So each test file has its own small fake. This duplicates about 30 lines per file; I chose that over the risk.
- **Logger output is not silenced.** A few tests intentionally trigger `logger.warn`/`logger.error` (payment-session failures, 500 mapping), so `yarn test` prints some stack traces. They are expected and not failures.
- **The two design gaps are `it.todo`, not code changes.** Neither is reachable through current routes. Fixing either one needs a product decision or touches every storefront system command. See Risks.
- **Spec "Evidence" lists not edited.** `spec/phase-1/features/FEAT-003/004/006` list test files as evidence. I did not edit `spec/`, to avoid merge conflicts with WS-G (docs). See "Actions the human must take".

## Bugs found

1. **Order detail and order history rounded money differently from checkout (fixed).**
   `storefront/lib/orders.ts` turned 4-decimal sales amounts into 2 decimals with `Math.round(x * 100) / 100`, and computed the detail subtotal with a float subtraction. The checkout response (`placeOrder`) uses `orderTotals()` → `round2()` → `toMinor()`. For half-paisa amounts, which sales tax can produce (for example `taxTotalAmount = '1.0050'`), the two disagree:
   - checkout response: subtotal 10.00, shipping 1.01, tax 1.01
   - order page: subtotal 10.01, shipping 1.00, tax 1.00

   **Fix:** 2 lines in `orders.ts`. `money()` now uses `round2()`, and the subtotal uses `orderTotals(order).subtotal`. The test was written first and failed before the fix: `orders.test.ts` → "rounds half-paise sales amounts exactly like the checkout response". This is display only: no stored values and no API shape change, and normal 2-decimal amounts are unaffected.

No other defects were found. The idempotency ledger, payment sync claim, cart isolation, order access rules, Razorpay confirm route and gift_catalog scope rules all behaved as their docs and specs describe under the new tests.

## Not done and why

- **Stripe webhook / session unit tests.** That code is the upstream `@open-mercato/gateway-stripe` package, not app code, and the brief says not to touch it. The app-level Stripe path is covered (see table).
- **Catalog detail route (`getCatalogProduct`), customer-account subscribers, gift_catalog admin CRUD list filters, the CLI/seed scripts.** These have lower risk than the money, webhook, idempotency and scoping paths I prioritised, and they ran out of time budget. They are good next candidates and follow the same fake-EM pattern.
- **Integration (Playwright) coverage.** Out of scope (no DB / backend allowed in this run). WS-E owns the end-to-end runs.

## Actions the human must take

1. Review and merge `m1/ws-c` into `milestone-1-hardening`. Only one production file changes (`storefront/lib/orders.ts`, the rounding fix). Everything else is new test files plus this handoff.
2. Optional docs follow-up (I left it alone to avoid conflicts with WS-G): add the new test files to the "Evidence" sections of `spec/phase-1/features/FEAT-003-shopping-cart.md`, `FEAT-004-checkout-orders.md` and `FEAT-006-order-history.md`, and mention the rounding fix in FEAT-006.
3. Decide on the two `it.todo` items (below), then either implement or delete them.

## Risks

- **Payment retry while an attempt is only `authorized`** (`checkout.test.ts`, `it.todo`). `retryOrderPayment` blocks a retry only when a status in `MONEY_TAKEN_STATUSES` is present (captured or refunded variants). An attempt that is only `authorized` (manual capture) does not block a second session, so a shopper could authorize twice. Today the storefront opens sessions with automatic capture, so `authorized` is transient and this is not reachable in practice. If manual capture is ever enabled, this becomes a double-charge risk. **Recommendation:** block a retry while any attempt is `authorized` and younger than the provider's authorization expiry. This needs a product decision on the expiry and the UX.
- **Address commands do not verify the tenant of the owner** (`addresses.commands.test.ts`, `it.todo`). `systemCommandContext` has `auth: null`, so `ensureTenantScope` cannot check `owner.tenantId`; only the organization is pinned. Every route builds the owner from the same resolved shop, so this is not reachable. It is a defence-in-depth gap. **Recommendation:** give `systemCommandContext` the tenant (for example a minimal `auth: { tenantId, orgId }`), and check it in `assertOwnerScope`. That touches every storefront system command (`sales.orders.create` and others), so it should be a separate, reviewed change.
- **Shop slug lookup is not tenant-scoped** (`gift_catalog/lib/storefrontScope.ts`, by design and documented in the code). On the platform domain, `orgSlug` resolves to the *oldest* active organization with that slug across all tenants. If two tenants use the same slug, the newer shop cannot be reached by slug, only by `organizationId` or a custom domain. Nothing leaks, because only public data of the resolved shop is read. Whether to enforce globally unique slugs is a product decision.
- **Merge overlap with WS-A.** WS-A works on idempotency and money paths. If WS-A changes `storefront/lib/checkout.ts` or the ledger semantics, some assertions in `checkout.test.ts` (status codes, ledger fields, paise strings) may need updating after the merge. They will fail loudly rather than silently pass.
- **Test brittleness.** The checkout and cart fakes mirror the current query shapes, such as equality filters on `tenantId`/`organizationId`/`deletedAt`. A refactor to different but equivalent filters (for example `$and` wrappers) may need fake updates; the failure messages will point at the fake.
