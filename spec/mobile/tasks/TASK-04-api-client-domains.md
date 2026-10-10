---
id: TASK-04
title: API client domains — catalog, occasions, cart, checkout, orders, addresses, payments
status: Done — 4 wire-shape discrepancies found & defensively handled, need live-backend re-verification (see spec/mobile/IMPLEMENTATION-NOTES.md)
---

# TASK-04 — API client domain functions

## Objective

Port the domain-specific API functions and zod schemas from `apps/storefront/src/lib/api/*.ts` into `apps/mobile/src/lib/api/`, adapted to call the backend directly (the web storefront goes through a same-origin BFF proxy at `/api/om/*`; mobile has no such proxy and must call `apps/mercato` directly — this task is where that difference is absorbed).

## Boundaries

**You own:** `apps/mobile/src/lib/api/catalog.ts`, `occasions.ts`, `cart.ts`, `checkout.ts`, `orders.ts`, `addresses.ts`, `payments.ts`, and `apps/mobile/src/lib/api/schemas/*.ts` if you choose to split schemas into their own files (optional — inlining per-domain is also fine).

**Do not touch:** `http.ts`, `env.ts`, `money.ts`, `idempotency.ts`, `errors.ts` (TASK-03 owns those — import from them, don't duplicate). Nothing under `src/features/**`.

## Contracts consumed (from TASK-03 — code against this signature even before TASK-03's file exists)

```ts
// src/lib/api/http.ts
export async function apiRequest<T>(
  path: string,
  schema: import('zod').ZodType<T>,
  options?: { method?: 'GET'|'POST'|'PUT'|'DELETE'; query?: Record<string, string|number|boolean|undefined>; body?: unknown; idempotencyKey?: string },
): Promise<T>

// src/lib/api/errors.ts
export class ApiError extends Error { code: string; status: number; details?: unknown }

// src/lib/api/idempotency.ts
export function newIdempotencyKey(): string
```

## Backend endpoints to wire (method, path, params, auth, response — from live research against `apps/mercato/src/modules/{storefront,gift_catalog,gateway_razorpay}`)

**Catalog** (`storefront/api/catalog/`, all guest-OK, 120 req/min/IP):
- `GET /api/storefront/catalog/products` — query: `page, pageSize(<=100), search, categoryId, categoryIds, handle, ids(csv<=200), minPrice, maxPrice, occasion, recipient, customizable, sort, giftOnly`. Response: list envelope `{items, total, page, pageSize, totalPages, totalIsCapped?}` of products with decimal INR pricing.
- `GET /api/storefront/catalog/products/{handle-or-id}` — detail incl. `variants[]`, `media[]`, `gift{occasions, recipientTypes, isCustomizable, proofRequired, giftWrapAvailable, giftMessageMaxLength, productionLeadTimeDays}`.
- `GET /api/storefront/catalog/categories` — `{items:[{id,name,slug,description,parentId,depth,isActive}]}`.

**Gift catalog** (`gift_catalog/api/storefront/`, guest-OK):
- `GET /api/gift_catalog/storefront/occasions` — `{items:[{code,label,description,imageUrl,sortOrder}]}` (only active ones are returned).
- `GET /api/gift_catalog/storefront/profiles` — query: `productIds` (csv, max 100) OR `occasion`/`recipient`/`customizable`.

**Cart** (`storefront/api/cart/`, guest-OK):
- `GET /api/storefront/cart` — `{cart:{id,currencyCode,lines[...],totals{subtotal,tax,itemCount},hasIssues,updatedAt}}`.
- `PUT /api/storefront/cart` — body `{lines:[{productId,variantId?,quantity,giftWrap?,giftMessage?}]}` (max 50 lines) — **replaces all lines**.
- `DELETE /api/storefront/cart` — empties the cart.
- `POST /api/storefront/cart/lines` — body is one `cartLineInputSchema` line; merges into an existing identical line (same product+variant+giftWrap+giftMessage) rather than duplicating.
- `PUT /api/storefront/cart/lines/{lineId}` — body `{quantity?, giftWrap?, giftMessage?}`.
- `DELETE /api/storefront/cart/lines/{lineId}`.
- Validation failures: `422 {error, code:'cart_invalid', details:[...]}` — surface these as a typed `ApiError` with `code === 'cart_invalid'` so TASK-06 can render per-line issues.

**Checkout** (`storefront/api/checkout/`, guest-allowed):
- `GET /api/storefront/checkout/shipping-methods` — query `subtotal, itemCount, postalCode?` → `{items:[{id,code,name,amount,currencyCode,estimatedTransitDays,carrierCode}]}`.
- `POST /api/storefront/checkout/orders` — **header `Idempotency-Key` required** (16-128 chars). Body: `{email, currencyCode:'INR', shippingAddress, billingAddress?, billingSameAsShipping, shippingMethodCode, paymentProvider:'razorpay', successUrl, cancelUrl}` (checks out the current server cart — do not send `lines`). Response `201`: `{orderId, orderNumber, currencyCode, totals{...}, payment:{transactionId, sessionId, providerKey, clientSecret, redirectUrl, providerData, clientSession, status, paymentId}}`. Same key + same body replays the existing order (200); same key + different body → `409 {code:'idempotency_key_reused'}`.
- `POST /api/storefront/orders/{id}/payment-session` — same `Idempotency-Key` requirement, body `{paymentProvider:'razorpay', successUrl, cancelUrl}` — retries payment on an unpaid order without duplicating it. Same response shape as above.

**Razorpay confirm** (`gateway_razorpay/api/confirm/`):
- `POST /api/gateway_razorpay/confirm` — body `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` (also send its own `Idempotency-Key`) → `{transactionId, paymentId, status, synced}`. Server verifies the HMAC signature — this app never does signature math itself.

**Orders** (`storefront/api/orders/`):
- `GET /api/storefront/orders/{id}` — works for **the owning signed-in customer OR a guest holding the `sf_order_access` cookie** set at checkout time. This is the endpoint TASK-08 uses for guest "my orders" lookups.
- `GET /api/storefront/orders` — **requires a signed-in customer** (`requireCustomer()`). Implement it anyway (for the fast-follow once real auth lands) but mark it clearly as unused in guest-only v1.

**Addresses** (`storefront/api/account/addresses/`) — **all require a signed-in customer**:
- `GET /api/storefront/account/addresses`, `POST /api/storefront/account/addresses`.
- `PUT /api/storefront/account/addresses/{id}`, `DELETE /api/storefront/account/addresses/{id}`.
- Implement these fully (TASK-08's address-book screen calls them), but every call will 401 until real auth exists — TASK-08's UI handles that via the "requires account" gating, this module just needs to surface the 401 as a typed `ApiError`.

## Contracts produced (used by TASK-05 through TASK-08 — exact names/shapes)

```ts
// catalog.ts
export interface Money { currencyCode: string; amount: number } // amount is decimal major units
export interface Product {
  id: string; title: string; subtitle?: string; description?: string; sku: string; handle: string
  imageUrl?: string; isConfigurable: boolean; isActive: boolean
  categories: Category[]; pricing: { currencyCode: string; unitPriceNet: number; unitPriceGross: number; taxRate: number; kind: string }
}
export interface ProductDetail extends Product {
  variants: Array<{ id: string; title: string; pricing: Product['pricing'] }>
  media: Array<{ id: string; url: string; alt?: string }>
  gift: { occasions: string[]; recipientTypes: string[]; isCustomizable: boolean; proofRequired: boolean; giftWrapAvailable: boolean; giftMessageMaxLength: number; productionLeadTimeDays: number }
}
export interface Category { id: string; name: string; slug: string; description?: string; parentId?: string; depth: number; isActive: boolean }
export interface ListEnvelope<T> { items: T[]; total: number; page: number; pageSize: number; totalPages: number; totalIsCapped?: boolean }
export interface ProductListParams { page?: number; pageSize?: number; search?: string; categoryId?: string; categoryIds?: string[]; handle?: string; ids?: string[]; minPrice?: number; maxPrice?: number; occasion?: string; recipient?: string; customizable?: boolean; sort?: 'newest'|'title'|'price-asc'|'price-desc'; giftOnly?: boolean }

export function listProducts(params?: ProductListParams): Promise<ListEnvelope<Product>>
export function getProductByHandle(handle: string): Promise<ProductDetail>
export function listCategories(): Promise<Category[]>

// occasions.ts
export interface Occasion { code: string; label: string; description?: string; imageUrl?: string; sortOrder: number }
export interface GiftProfile { productId: string; occasions: string[]; recipientTypes: string[]; isCustomizable: boolean; proofRequired: boolean; giftWrapAvailable: boolean; giftMessageMaxLength: number; productionLeadTimeDays: number }
export function listOccasions(): Promise<Occasion[]>
export function getGiftProfiles(params: { productIds?: string[]; occasion?: string; recipient?: string; customizable?: boolean }): Promise<GiftProfile[]>

// cart.ts
export interface CartLineIssue { lineId: string; code: string; message: string }
export interface CartLine { id: string; productId: string; variantId?: string; quantity: number; giftWrap?: boolean; giftMessage?: string; unitPriceMajor: number; lineTotalMajor: number }
export interface Cart { id: string; currencyCode: string; lines: CartLine[]; totals: { subtotalMajor: number; taxMajor: number; itemCount: number }; hasIssues: boolean; updatedAt: string }
export interface CartLineInput { productId: string; variantId?: string; quantity: number; giftWrap?: boolean; giftMessage?: string }
export function getCart(): Promise<Cart>
export function replaceCartLines(lines: CartLineInput[]): Promise<Cart>
export function clearCart(): Promise<void>
export function addCartLine(input: CartLineInput): Promise<Cart>
export function updateCartLine(lineId: string, patch: { quantity?: number; giftWrap?: boolean; giftMessage?: string }): Promise<Cart>
export function removeCartLine(lineId: string): Promise<Cart>

// checkout.ts
export interface Address { fullName: string; phone: string; line1: string; line2?: string; city: string; state: string; postalCode: string; country: string }
export interface ShippingMethod { id: string; code: string; name: string; amountMajor: number; currencyCode: string; estimatedTransitDays: number; carrierCode?: string }
export interface PaymentSession { transactionId: string; sessionId: string; providerKey: 'razorpay'; clientSecret?: string; redirectUrl?: string; providerData?: Record<string, unknown>; clientSession?: Record<string, unknown>; status: string; paymentId?: string }
export interface PlacedOrder { orderId: string; orderNumber: string; currencyCode: string; totals: { subtotalMajor: number; shippingMajor: number; taxMajor: number; grandTotalMajor: number }; payment: PaymentSession }
export interface PlaceOrderInput { email: string; currencyCode: 'INR'; shippingAddress: Address; billingAddress?: Address; billingSameAsShipping: boolean; shippingMethodCode: string; paymentProvider: 'razorpay'; successUrl: string; cancelUrl: string }
export function getShippingMethods(params: { subtotalMajor: number; itemCount: number; postalCode?: string }): Promise<ShippingMethod[]>
export function placeOrder(input: PlaceOrderInput, idempotencyKey: string): Promise<PlacedOrder>
export function openPaymentSession(orderId: string, input: { paymentProvider: 'razorpay'; successUrl: string; cancelUrl: string }, idempotencyKey: string): Promise<PlacedOrder>

// payments.ts
export interface RazorpayConfirmInput { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
export interface RazorpayConfirmResult { transactionId: string; paymentId: string; status: string; synced: boolean }
export function confirmRazorpayPayment(input: RazorpayConfirmInput, idempotencyKey: string): Promise<RazorpayConfirmResult>

// orders.ts
export interface OrderSummary { id: string; orderNumber: string; placedAt: string; currencyCode: string; grandTotalGrossMajor: number; status: string; paymentStatus: string; lineItemCount: number }
export interface OrderLine { id: string; productTitle: string; quantity: number; unitPriceMajor: number; giftWrap?: boolean; giftMessage?: string }
export interface OrderDetail extends OrderSummary { lines: OrderLine[]; payment: { providerKey: string; transactionId: string; status: string }; shippingAddress: Address }
export function getOrder(orderId: string): Promise<OrderDetail> // works for guest (sf_order_access) or owning customer
export function listMyOrders(page?: number): Promise<ListEnvelope<OrderSummary>> // requires signed-in customer — unused in guest-only v1, implemented for fast-follow

// addresses.ts
export interface StoredAddress extends Address { id: string; isDefault: boolean }
export function listAddresses(): Promise<StoredAddress[]>
export function createAddress(input: Address): Promise<StoredAddress>
export function updateAddress(id: string, patch: Partial<Address>): Promise<StoredAddress>
export function deleteAddress(id: string): Promise<void>
```

All `*Major` fields are **decimal major-unit numbers** coming straight off the wire (no conversion inside these functions) — TASK-05/06/07/08 call `formatMoney()`/`toMinorUnits()` from TASK-03's `money.ts` themselves when they need display formatting or integer-minor arithmetic. Keep this module's job limited to typed I/O.

## Acceptance criteria

- Every function above round-trips against a local mock server or recorded fixture matching the shapes documented here (unit test with mocked `apiRequest` is sufficient — a live backend is not required to validate this task in isolation).
- `cart_invalid` (422) and `idempotency_key_reused` (409) are both reachable as `ApiError.code` values through normal error propagation (no swallowing).
- India-specific validation for `Address` (10-digit mobile number, 6-digit PIN) lives here as a zod schema (`addressSchema`) ported from `apps/storefront/src/lib/api/addresses.ts`'s equivalent — TASK-07's form reuses this schema rather than re-implementing validation.

## Dependencies to add

```
zod
```

## Non-goals

- No UI, no React components, no navigation.
- No Stripe functions (out of scope for this pass — Razorpay only).
