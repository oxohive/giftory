# Storefront ↔ Open Mercato 0.8.0 — Backend API Contract

Source of truth: the installed packages under `apps/mercato/node_modules/@open-mercato/`
(`core/dist/modules/*`, `checkout/dist`, `gateway-stripe/dist`) and the generated route manifest
`apps/mercato/.mercato/generated/api-route-metadata.generated.ts`. All paths below are relative to
`{NEXT_PUBLIC_API_BASE_URL}` (default `http://localhost:3000`). Every module route is served at
`/api/<module>/<path>` by the catch-all `apps/mercato/src/app/api/[...slug]/route.ts`.

Short paths in the tables: `core:` = `@open-mercato/core/dist/modules/`, `shared:` = `@open-mercato/shared/dist/`.

Verified live (backend running at :3000 while this was written):
- `POST /api/customer_accounts/login` without an org returns `400 {"ok":false,"error":"organizationId or tenantId is required for platform-domain logins"}`.
- Unknown routes return `404 {"error":"Not Found"}`. TODO adapters rely on this.
- `GET /api/catalog/products` with a bogus `x-api-key` returns `401 {"error":"Unauthorized"}`.

---

## 1. Auth model and tenant resolution

| Concern | Finding | Source |
|---|---|---|
| Route guard | Each route exports `metadata` (`requireAuth`, `requireFeatures`). The dispatcher resolves **staff** auth only: a Bearer/`auth_token` JWT, or an API key. `requireAuth: false` routes run their own checks. | `apps/mercato/src/app/api/[...slug]/route.ts`, `shared:lib/auth/server.js#resolveAuthFromRequestDetailed` |
| Staff API keys | `x-api-key: <secret>` header or `Authorization: ApiKey <secret>`. The key is scoped to a tenant and org and carries roles, so it gets those roles' features. | `shared:lib/auth/server.js#extractApiKey`, `#resolveApiKeyAuth` |
| Customer (shopper) auth | JWT with audience `customer`, read from `Authorization: Bearer <jwt>` **or** the `customer_auth_token` cookie. It is verified against an active session (`customer_session_token`). | `core:customer_accounts/lib/customerAuth.js#getCustomerAuthFromRequest` |
| Customer cookies | Login sets `customer_auth_token` (JWT, httpOnly, `SameSite=Lax`, `Path=/`, 8h, `Secure` in production) and `customer_session_token` (raw session token, 30d). No `Domain` attribute, so they bind to the host that served the response. | `core:customer_accounts/api/login.js` |
| Customer JWT on staff routes | A customer JWT sent as Bearer to a staff-guarded route is rejected (`payload.type === 'customer'` → invalid). Customers can never call catalog, sales or payment routes directly. | `shared:lib/auth/server.js` |
| Tenant resolution (public customer routes) | `resolveTenantContext(req, bodyTenantId, {organizationId})`. If the request `Host` is a **platform domain** (`PLATFORM_DOMAINS`, default `localhost,openmercato.com`), the body must carry `organizationId` (the tenant is derived from it) or `tenantId`. On any other host, the org is resolved from the **custom-domain mapping** (`domainMappingService.resolveByHostname`), and body ids must match it. | `core:customer_accounts/lib/resolveTenantContext.js`, `core:customer_accounts/lib/platformDomains.js` |
| Org lookup by slug | `GET /api/directory/organizations/lookup?slug=` (public) → `{ ok, organization: { id, name, slug } }` | `core:directory/api/get/organizations/lookup.js` |
| CORS | **None.** No `Access-Control-*` handling exists in core, shared, the app proxy (`src/proxy.ts` skips `/api/`) or `next.config.ts`. | grep over `shared/dist`, `core/dist`, `apps/mercato/src` |
| Origin checks | Security emails (signup, reset) call `assertAllowedAppOrigin`. Allowed origins are `APP_URL`, `NEXT_PUBLIC_APP_URL` and `APP_ALLOWED_ORIGINS` (CSV); loopback is allowed in dev. Checkout pay pages use `CHECKOUT_ALLOWED_ORIGINS`. | `shared:lib/url.js`, `checkout/AGENTS.md` |
| Client IP / rate limit | `getClientIp` trusts `x-forwarded-for` only when `RATE_LIMIT_TRUST_PROXY_DEPTH > 0`. Login and signup are rate-limited per IP and per email. | `shared:lib/ratelimit/helpers.js`, `shared:lib/ratelimit/config.js` |
| Money | Prices and amounts are **decimal major units** (number or numeric string). The storefront converts them to integer minor units (`src/lib/money.ts`). The payment session `amount` is major units too, and Stripe converts with `toCents`. | `core:catalog/api/prices/route.js`, `core:payment_gateways/data/validators.js`, `gateway-stripe/.../lib/shared.js` |
| List envelope | `{ items, total, page?, pageSize?, totalPages, totalIsCapped? }`. The CRUD factory also accepts `ids=<csv>` (max 200). | `shared:lib/openapi/crud.js#createPagedListResponseSchema`, `shared:lib/crud/factory.js` |
| Error envelope | `{ error: string, details? }` on CRUD routes; `{ ok: false, error }` on customer_accounts routes. | route files |

### How the storefront uses this
- **Catalog (server components):** server-side `fetch` to the public `storefront` facade (`/api/storefront/catalog/*`), with `organizationId` (or `orgSlug`) from server config appended (`serverRequest({ withShop: true })`). No API key is needed any more.
- **Customer, cart, checkout, orders and addresses (browser):** go through the storefront BFF proxy `src/app/api/om/[...path]/route.ts`. The proxy:
  - allows only an explicit list of paths;
  - forwards only the two customer cookies plus the `storefront` module cookies `sf_cart_token` (anonymous cart) and `sf_order_access` (guest order access);
  - relays the backend's `Set-Cookie` headers, so all cookies become first-party on the storefront origin;
  - refreshes an expired JWT through `sessions-refresh`;
  - injects `MERCATO_ORGANIZATION_ID`/`MERCATO_TENANT_ID` into login, signup, reset and magic-link bodies;
  - sets `organizationId` (else `orgSlug`) from server config on every `storefront/*` and `gift_catalog/*` query string (overwriting any client value), so the backend can resolve the shop on platform domains.

  Because of the proxy, **no CORS and no cookie-domain changes are needed**.

---


## 2. Catalog (products, variants, prices, categories)

**G1/G6 closed** by the backend `storefront` module (`apps/mercato/src/modules/storefront`). All routes are public (`requireAuth: false`), rate limited per IP (120/min), and resolve the shop like the gift_catalog storefront routes: custom-domain host, then customer session, then the `orgSlug`/`organizationId` query (the tenant is always derived server-side). Only live (`deleted_at` null), active products inside their availability window are visible. Field names mirror the native catalog routes (snake_case, decimal major units).

| Purpose | Endpoint | Key params / response | Source |
|---|---|---|---|
| List/search products | `GET /api/storefront/catalog/products` | `page, pageSize<=100, search` (ILIKE title/subtitle/sku/handle), `categoryId`, `categoryIds` (csv, sub-categories included), `handle` (exact), `ids` (csv, max 200), `minPrice`/`maxPrice` (major units), `occasion`/`recipient`/`customizable` (gift_catalog codes), `sort=newest/title/price-asc/price-desc`. Returns `{ items, total, page, pageSize, totalPages, totalIsCapped }`. Items: `id, title, subtitle, description, sku, handle, primary_currency_code, default_media_url, is_configurable, is_active, is_quote_only, requires_shipping, min_order_qty, max_order_qty, order_qty_increment, seo_title, seo_description, categories[{id,name,slug}], categoryIds, pricing{currency_code, unit_price_net, unit_price_gross, tax_rate, kind, price_id} or null, created_at`. `pricing` is the lowest public INR `regular` price of the product or its active variants. Price filters and price sorts scan at most 1000 matches (`totalIsCapped`). | `storefront/api/catalog/products/route.ts`, `storefront/lib/catalog.ts` |
| Product detail | `GET /api/storefront/catalog/products/{handle-or-id}` | `{ item }`: the product plus `variants[{id, product_id, name, sku, is_default, is_active, option_values, default_media_url, pricing}]`, `media[{id, fileName, url, thumbnailUrl}]` and `gift{occasions, recipientTypes, isCustomizable, proofRequired, giftWrapAvailable, giftMessageMaxLength, productionLeadTimeDays}` or null. 404 `{error, code:'not_found'}`. | `storefront/api/catalog/products/[slug]/route.ts` |
| Categories | `GET /api/storefront/catalog/categories` | `{ items: [{ id, name, slug, description, parentId, depth, isActive }] }` | `storefront/api/catalog/categories/route.ts` |
| Product media | `GET /api/attachments/image/{id}/{slug?}` (**public**). `default_media_url` and `media[].url` point here. | image bytes | `core:attachments/api/image/[id]/[[...slug]]/route.js` |

Public prices are rows of `catalog_product_variant_prices` with currency `INR`, price kind code `regular`, no channel/offer/customer/user/group targeting, inside `starts_at`/`ends_at`, selected for the quantity (a variant row beats a product row; the highest reachable quantity tier wins). Net is derived from the tax rate when only gross is stored.

The staff routes (`/api/catalog/products|variants|prices|categories`, `catalog.products.view`) are no longer used by the storefront.

Storefront client: `src/lib/api/catalog.ts` (server-only), with wire schemas and domain types in `src/lib/api/catalog.schemas.ts`.

---

## 3. Customer accounts (registration, login, session, profile)

All routes are `requireAuth: false` and do their own customer-JWT checks. Base path: `/api/customer_accounts`.

| Purpose | Endpoint | Body / response | Source |
|---|---|---|---|
| Register | `POST /signup` | `{ email, password(8–128), displayName, tenantId?, organizationId? }` → **always `202 {ok:true}`** (no account enumeration). Sends a verification email. The account **cannot log in until verified** (login returns 401 when `emailVerifiedAt` is null). | `api/signup.js`, `data/validators.js#signupSchema` |
| Verify email | `POST /email/verify` | `{ token }` → `{ ok: true }` | `api/email/verify.js` |
| Login | `POST /login` | `{ email, password, tenantId?, organizationId? }` → `{ ok, user{id,email,displayName,emailVerified}, resolvedFeatures }` and sets cookies | `api/login.js` |
| Refresh | `POST /portal/sessions-refresh` | uses the `customer_session_token` cookie → new `customer_auth_token` | `api/portal/sessions-refresh.js` |
| Logout | `POST /portal/logout` | clears both cookies | `api/portal/logout.js` |
| Profile | `GET /portal/profile` | `{ ok, user{id,email,displayName,emailVerified,customerEntityId,personEntityId,isActive,lastLoginAt,createdAt}, roles[], resolvedFeatures[], isPortalAdmin }` | `api/portal/profile.js` |
| Update profile | `PUT /portal/profile` | `{ displayName? }`; requires customer feature `portal.account.manage` | same |
| Change password | `POST /portal/password-change` | `{ currentPassword, newPassword }` | `api/portal/password-change.js` |
| Password reset | `POST /password/reset-request` `{email, tenantId?}`, `POST /password/reset-confirm` `{token, password}` | | `api/password/*.js` |
| Magic link | `POST /magic-link/request` `{email, tenantId?}`, `POST /magic-link/verify` `{token}` | | `api/magic-link/*.js` |

Notes:
- **Verification and reset links point at Open Mercato's portal, not the storefront.** They use `{PLATFORM_PORTAL_BASE_URL or APP_URL}/{orgSlug}/portal/verify?token=…`, or the org's active custom domain (`core:customer_accounts/lib/customerUrl.js#urlForCustomerOrg`, `api/signup.js`). The storefront has `/account/verify?token=`, but the backend email link must be pointed there (**GAP G7**, see §8).
- Customer **address** endpoints are provided by the `storefront` module (`/api/storefront/account/addresses`, G4 closed).

Storefront client: `src/lib/api/customer.ts`.

---

## 4. Cart

**G2 closed.** The backend `storefront` module keeps a server-side cart (`storefront_carts` / `storefront_cart_lines`), keyed by an anonymous httpOnly cookie `sf_cart_token` (30 days; only its SHA-256 is stored) or by the signed-in customer. When a customer calls any cart route with an anonymous cart cookie, the anonymous lines are merged into their cart and the cookie is cleared. Lines store `productId, variantId, quantity (1-20), giftWrap, giftMessage` only; every response re-prices them from the catalog and flags lines that can no longer be bought (`issue`). A native sales quote is deliberately not used as the cart (quote numbers, staff notifications, audit/undo per line change, backoffice quote list pollution).

| Endpoint | Body | Response |
|---|---|---|
| `GET /api/storefront/cart` | none | `{ cart: { id, currencyCode, lines[{ id, key, productId, variantId, slug, title, variantName, sku, imageUrl, quantity, maxQuantity, currencyCode, unitPriceNet, unitPriceGross, totalGross, gift{giftWrap, giftMessage}, isCustomizable, available, issue }], totals{ subtotal, tax, itemCount }, hasIssues, updatedAt } }` |
| `PUT /api/storefront/cart` | `{ lines: [{ productId, variantId?, quantity, giftWrap?, giftMessage? }] }` (max 50) | `{ cart }`; replaces all lines (sync a device cart) |
| `DELETE /api/storefront/cart` | none | `{ cart }` (empty) |
| `POST /api/storefront/cart/lines` | one line | `201 { cart }`; merges into an identical product/variant/gift line |
| `PUT /api/storefront/cart/lines/{lineId}` | `{ quantity?, giftWrap?, giftMessage? }` | `{ cart }` |
| `DELETE /api/storefront/cart/lines/{lineId}` | none | `{ cart }` |

Validation errors: `422 { error, code: 'cart_invalid', details: [{ index, productId, variantId, code, maxLength? }] }` with line codes `product_unavailable, variant_unavailable, variant_required, quote_only, price_unavailable, quantity_below_minimum, quantity_above_maximum, quantity_increment, gift_wrap_unavailable, gift_message_not_allowed, gift_message_too_long`. Gift options are checked against the gift_catalog profile (`giftWrapAvailable`, `giftMessageMaxLength`); products without a profile allow no gift wrap and messages up to 250 characters.

How the storefront uses it: `src/lib/cart/cart-context.tsx` keeps the server cart in TanStack Query (`['cart']`) through `cartApi` (`src/lib/api/cart.ts`).
- Changes are applied optimistically and then replaced by the server's re-priced cart, whose totals are authoritative. On error the previous cart is restored and refetched.
- Line errors (`cart_invalid` details, `issue` codes) are shown on the line or on the add-to-cart form.
- The cart is refetched when the signed-in customer changes, so the merge after login shows up straight away.
- A one-time migration pushes any old `localStorage` cart (`sf.cart.v1`) into the server cart line by line (`POST /cart/lines`), then deletes it. It is kept only if the backend could not be reached.

---

## 5. Checkout: shipping, order placement, payment

**G3 closed** by the backend `storefront` module. The storefront calls it through the BFF proxy (`/api/om/storefront/*` to `/api/storefront/*`). Customer auth is optional (guests allowed); privileged work runs server-side as native commands in a system context pinned to the resolved shop.

| Endpoint | Request | Response |
|---|---|---|
| `GET /api/storefront/checkout/shipping-methods?subtotal=<major>&itemCount=&postalCode=` | none | `{ items: [{ id, code, name, description, amount (major, gross), currencyCode, estimatedTransitDays, carrierCode }] }` from active INR (or currency-less) `sales_shipping_methods`, priced by the native `salesCalculationService` (provider methods such as `flat-rate` tiers) or the method base rate. Uses the server cart when it has lines, else `subtotal`/`itemCount`. |
| `POST /api/storefront/checkout/orders` (header `Idempotency-Key`, 16-128 chars of `A-Za-z0-9_-:.`) | `{ email, currencyCode:'INR', lines?:[{productId, variantId, quantity, giftWrap, giftMessage}], shippingAddress, billingAddress, billingSameAsShipping, shippingMethodCode, paymentProvider:'stripe' or 'razorpay', successUrl, cancelUrl }`. Omit `lines` to check out the server cart. `{orderId}` in `successUrl`/`cancelUrl` is substituted. | `201 { orderId, orderNumber, currencyCode, totals:{subtotal, shipping, tax, grandTotal} (major), payment }`; `200` with the same body for an idempotent replay. `payment` is exactly the `/payment_gateways/sessions` body: `{ transactionId, sessionId, providerKey, clientSecret, redirectUrl, providerData, clientSession, status, paymentId }`. Guests also get the httpOnly `sf_order_access` cookie. |
| `POST /api/storefront/orders/{id}/payment-session` (header `Idempotency-Key`) | `{ paymentProvider, successUrl, cancelUrl }` | Same body as order placement, for an existing unpaid order (payment retry without a second order). `409 order_already_paid` once paid. |

What `POST /orders` does:
1. Validates `successUrl`/`cancelUrl` against `STOREFRONT_ALLOWED_RETURN_ORIGINS` (else `APP_ALLOWED_ORIGINS`/`APP_URL`; loopback allowed outside production): `422 return_url_not_allowed`.
2. Re-prices every line from the catalog (client prices are never read) and validates gift options: `422 cart_invalid`.
3. Claims an idempotency ledger row (`storefront_checkouts`, unique per tenant + org + key, bound to a hash of the canonical body and the shopper). Same key with a different body: `409 idempotency_key_reused`; a concurrent duplicate: `409 checkout_in_progress` (`Retry-After: 2`).
4. Finds or creates the CRM person (G8) and creates the order with `sales.orders.create`: lines (`kind: product`, catalog price id, unit net/gross, tax rate/amount, line gross total, `catalogSnapshot`, `metadata.gift = { giftWrap, giftMessage }`), customer and address snapshots (address `phone` included), `shippingMethodId` (plus a `shipping` adjustment for provider-less methods), the payment method (when a sales payment method with that provider key or code exists), payment status `pending`, `externalReference = storefront:<checkoutId>`. `sales.document-addresses.create` is attempted for shipping and billing (best effort). Totals are the order's own (native calculator).
5. Calls `paymentGatewayService.createPaymentSession({ providerKey, paymentId, idempotencyKey, orderId, amount = amount due, currencyCode, successUrl, cancelUrl, ... })`. If that fails the order is kept: `502/422 { code: 'payment_session_failed', orderId, orderNumber }`; retry with the same `Idempotency-Key` or use the payment-session route.

Error envelope of the facade: `{ error, code, details? }`. Codes: `shop_required, shop_not_found, invalid_request, authentication_required, not_found, order_not_found, cart_empty, cart_invalid, cart_line_limit, shipping_method_unavailable, return_url_not_allowed, idempotency_key_required, idempotency_key_reused, checkout_in_progress, order_already_paid, payment_session_failed, internal_error`.

Storefront usage (`src/components/checkout/checkout-form.tsx`, `src/lib/checkout/checkout-session.ts`):
- `POST /checkout/orders` is sent **without `lines`**, so the server cart is checked out.
- The `Idempotency-Key` is created once per checkout attempt and kept in sessionStorage. Retries after errors or reloads reuse it, and it is replaced only once the attempt has produced an order.
- Once an order exists (a `201`/`200` response, or `payment_session_failed` with an `orderId`), it is stored as the pending order. Every later payment attempt (dismissed or failed Razorpay modal, declined card, Stripe redirect with `redirect_status=failed`) goes through `POST /orders/{id}/payment-session`, with its own key. `order_already_paid` sends the shopper to the confirmation page.
- Resolved backend limitations (2026-10-06):
  - Replaying `POST /checkout/orders` without `lines` (cart checkout) under the same `Idempotency-Key` returns the existing order, even though the cart was closed. For cart checkouts the key is bound to the cart owner, not the cart contents.
  - Guests receive `sf_order_access` even when the payment session fails (`payment_session_failed`), so they can read the order and use `POST /orders/{id}/payment-session`.

Payment client side: `src/lib/api/payments.ts`.
- Stripe: Payment Element plus `stripe.confirmPayment({ redirect: 'if_required', return_url: /order/{id}/confirmation?provider=stripe })`. Settled by `POST /api/payment_gateways/webhook/stripe`.
- Razorpay: Checkout.js is loaded only on demand from `checkout.razorpay.com/v1/checkout.js`, using `clientSession.payload: { keyId, orderId, amount (paise), currency }` (also in `providerData` as `{ keyId, razorpayOrderId, amountMinor, currency }`). On success it calls `POST /api/gateway_razorpay/confirm { razorpay_payment_id, razorpay_order_id, razorpay_signature }`, which returns `{ transactionId, paymentId, status, synced }` (202 when the sync is deferred to webhooks).

**Payment status follows the gateway transaction.** `payment_gateways` emits `payment_gateways.payment.{authorized,captured,failed,refunded,cancelled}` on every transition (webhooks, poller, Razorpay confirm). The `storefront` module subscribes and, from the transaction state: mirrors the unified status to the checkout ledger; on capture records one `sales.payments.create` (so `paidTotalAmount`/`outstandingAmount` are recomputed natively); on a full refund updates that payment (`sales.payments.update`); and sets the order payment status (`pending/authorized/captured/refunded/failed/canceled`) and the order status `confirmed` once paid, via `sales.orders.update`.

The native staff routes (`/api/sales/*`, `/api/payment_gateways/sessions`, `/api/shipping-carriers/rates`) remain staff-only and are not called by the storefront. `@open-mercato/checkout` (pay links) is not used.

---

## 6. Order history

**G5 closed.**

| Purpose | Endpoint | Notes | Source |
|---|---|---|---|
| List my orders | `GET /api/storefront/orders?page=&pageSize<=50` | Customer session required (401 otherwise). Orders placed by this customer through the storefront, plus orders whose `customer_entity_id` is the customer's linked CRM person. `{ ok, items[{ id, orderNumber, placedAt, currencyCode, grandTotalGrossAmount, status, paymentStatus, lineItemCount }], total, page, pageSize }` (a superset of the warranty_claims shape). | `storefront/api/orders/route.ts` |
| Order detail | `GET /api/storefront/orders/{id}` | Visible to the customer who placed it or whose CRM person owns it, or to a guest holding the `sf_order_access` cookie from checkout. Anything else: `404 { code: 'order_not_found' }`. Returns `{ id, orderNumber, status, paymentStatus, fulfillmentStatus, placedAt, currencyCode, subtotal, shippingTotal, taxTotal, discountTotal, grandTotal, paidTotal, outstandingAmount, shippingMethod, shippingAddress, billingAddress, payment{providerKey, transactionId, status}, lines[{ id, productId, variantId, name, sku, slug, imageUrl, quantity, unitPriceGross, totalGross, giftWrap, giftMessage }] }`. `status` is the sales order status, or `pending_payment`/`payment_failed` before one is set; `paymentStatus` is the unified gateway status. | `storefront/api/orders/[id]/route.ts` |
| Fallback (older backends) | `GET /api/warranty_claims/portal/orders`, `.../orders/lines?orderId=` | Used by `ordersApi` only when the storefront routes are missing. | `core:warranty_claims/api/portal/orders/*` |

---

## 7. gift_catalog

The module exists (`apps/mercato/src/modules/gift_catalog`). Its public, rate-limited storefront routes resolve the shop like the `storefront` module:

| Endpoint | Response |
|---|---|
| `GET /api/gift_catalog/storefront/occasions` | `{ ok, items: [{ code, label, description, imageUrl, sortOrder }] }` |
| `GET /api/gift_catalog/storefront/profiles?productIds=<csv, max 100>` or `?occasion=&recipient=&customizable=` | `{ ok, items: [{ productId, occasions, recipientTypes, isCustomizable, proofRequired, giftWrapAvailable, giftMessageMaxLength, productionLeadTimeDays, personalizationNotes, fulfillmentMode }], total, page, pageSize, totalPages, totalIsCapped }` |

`src/lib/api/gift-catalog.ts` maps occasions to `{ id: code, slug: code, name: label }` (occasion slugs are gift_catalog codes such as `birthday`, `thank_you`). A product without a profile uses the backend defaults (no gift wrap, messages of at most 250 characters), which the backend also enforces at cart and checkout time. The storefront product detail route also returns the profile (`item.gift`).

---

## 8. Gap list

| # | Gap | Status |
|---|---|---|
| G1 | No anonymous catalog API | **Closed**: `/api/storefront/catalog/*` (public, rate limited) |
| G2 | No cart | **Closed**: `/api/storefront/cart*`. The storefront UI uses the server cart, and checkout omits `lines` |
| G3 | No customer checkout | **Closed**: `/api/storefront/checkout/shipping-methods`, `/api/storefront/checkout/orders`, `/api/storefront/orders/{id}/payment-session` |
| G4 | No customer address book | **Closed**: `/api/storefront/account/addresses` (device storage only as a fallback for older backends and signed-out shoppers) |
| G5 | Limited customer order history | **Closed**: `/api/storefront/orders`, `/api/storefront/orders/{id}` |
| G6 | No price-range or handle filter | **Closed**: `minPrice`, `maxPrice`, `handle` and price sorts on the catalog list |
| G7 | Verification/reset email links target the Open Mercato portal | Open (backend configuration, see section 9.5) |
| G8 | Signup doesn't link a CRM customer | **Closed**: on e-mail verification (and on first order) the account is linked to a CRM person, found by e-mail or created with `customers.people.create`; guest orders are linked to a person by e-mail. `CustomerUser.customerEntityId` (the native *company* link) is untouched, so `warranty_claims/portal/orders` still answers 403 for B2C shoppers; use `/api/storefront/orders`. |
| G9 | gift_catalog / gateway_razorpay contracts unverified | **Closed**: the adapters use the real routes and payloads (sections 5 and 7) |

---

## 9. Backend configuration the integrator must apply

1. **Enable the module.** In `apps/mercato/src/modules.ts`, after the `gift_catalog` push: `enabledModules.push({ id: 'storefront', from: '@app' })`. Then `yarn generate`, `yarn db:generate` (review the `storefront_*` tables), `yarn db:migrate`, and `yarn mercato entities seed-encryption --tenant <id>` for existing tenants.
2. **Tenant ids.** Set `MERCATO_ORGANIZATION_ID` (or `MERCATO_ORGANIZATION_SLUG`) and optionally `MERCATO_TENANT_ID` in the storefront env. Look the org up with `GET /api/directory/organizations/lookup?slug=<slug>`. They are needed because the storefront calls the backend at a platform-domain host (`localhost` is in the default `PLATFORM_DOMAINS`). If the backend is reached via a custom domain mapped to the org, the host resolves it and the ids must match. `MERCATO_STOREFRONT_API_KEY` is no longer needed.
3. **Shipping methods.** Create active shipping methods (Sales settings) with INR (or empty) currency; their codes are what the storefront submits. The storefront falls back to its static "estimated" list only when the endpoint is missing. Optionally create sales payment methods with provider key or code `stripe` and `razorpay` so orders carry a payment method.
4. **Return URL allow-list.** Set `STOREFRONT_ALLOWED_RETURN_ORIGINS=https://<storefront-host>` on the backend; in production every success/cancel URL is rejected otherwise.
5. **Email links (G7).** Set `PLATFORM_PORTAL_BASE_URL` (required in production) and `APP_URL`. Customer verification and reset links go to `{base}/{orgSlug}/portal/verify?token=...`. Making them land on `https://<storefront>/account/verify?token=...` needs one of:
   - a redirect on the backend portal route;
   - a reverse-proxy rewrite;
   - an override of the signup/verification email via the module overrides in `apps/mercato/src/modules.ts`.
6. **CORS and cookie domain: none needed** (BFF proxy, host-only cookies relayed by the proxy).
7. **Rate limiting behind the proxy.** The proxy sends `x-forwarded-for: <client ip>`. Set `RATE_LIMIT_TRUST_PROXY_DEPTH=1` on the backend, and set `KNOWN_PROXY_IP_RANGES` to the storefront servers. Otherwise every shopper shares the storefront's IP bucket (the checkout route allows 10 orders per minute per IP).
8. **Payment keys.**
   - Backend: `OM_INTEGRATION_STRIPE_PUBLISHABLE_KEY`, `OM_INTEGRATION_STRIPE_SECRET_KEY`, `OM_INTEGRATION_STRIPE_WEBHOOK_SECRET`, plus the Razorpay key id, secret and webhook secret used by `gateway_razorpay` (`lib/preset.ts`).
   - Storefront (public, fallback only): `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_RAZORPAY_KEY_ID`. The session payload is preferred.
   - Webhook URLs: `{backend}/api/payment_gateways/webhook/stripe` and `{backend}/api/payment_gateways/webhook/razorpay`.
9. **Workers.** Payment status sync and CRM linking run in persistent event subscribers; the events/queue worker must run in every environment.
