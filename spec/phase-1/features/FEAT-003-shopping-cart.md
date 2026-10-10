# Feature: Shopping Cart

- **Feature ID:** FEAT-003
- **Phase:** 1
- **Status:** Implemented
- **Objective:** Provide a persistent, server-side cart for anonymous and authenticated shoppers, supporting gift wrap and gift message per line.
- **Business Value:** Cart persistence across sessions and devices reduces abandonment; gift-specific line options (wrap, message) are core to the product experience.
- **Scope:** Server-side cart with anonymous (cookie) and customer-owned (session) modes, line CRUD, gift wrap toggle, gift message per line, guest cart merge on login.
- **Out of Scope:** Customization design config on cart lines (Phase 3).

## Current Behavior

**Verified** from `apps/mercato/src/modules/storefront/data/entities.ts` and API contract.

Anonymous shoppers are identified by an `sf_cart_token` cookie (SHA-256 of a random token, stored in `storefront_carts.token_hash`). On login, the guest cart merges into the customer's cart.

Cart lines support `gift_wrap` (bool) and `gift_message` (text, max `gift_message_max_length` from the product's gift profile). A `line_key` deduplicates lines: `product:variant:wrap:sha256(message)`.

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/storefront/cart` | Get current cart (creates one if missing) |
| `PUT` | `/api/storefront/cart` | Replace all lines |
| `DELETE` | `/api/storefront/cart` | Empty cart |
| `POST` | `/api/storefront/cart/lines` | Add line |
| `PUT` | `/api/storefront/cart/lines/{lineId}` | Update line (qty, gift wrap, message) |
| `DELETE` | `/api/storefront/cart/lines/{lineId}` | Remove line |

All routes: `requireAuth: false`, rate-limited 120 req/min per IP.

## Cart Entities

Table: `storefront_carts`

| Field | Notes |
|---|---|
| `token_hash` | SHA-256 of anonymous cart cookie; null once adopted by a customer |
| `customer_user_id` | Set when a customer adopts the cart |
| `status` | `active` \| `converted` \| `merged` |
| `converted_order_id` | Set when cart becomes an order |

Table: `storefront_cart_lines`

| Field | Notes |
|---|---|
| `product_id`, `variant_id` | What was added |
| `quantity` | Integer, minimum 1 |
| `gift_wrap` | Bool |
| `gift_message` | Text, nullable |
| `line_key` | Dedup key: `product:variant:wrap:sha256(message)` |

## Requirements

1. Cart must persist across page reloads (stored server-side).
2. Anonymous cart is identified by a cookie; no login required.
3. On customer login, the anonymous cart must merge into the customer cart.
4. Gift wrap and gift message can be set independently per line.
5. Gift message must be validated against the product's `gift_message_max_length` (default 250).
6. A gift message exceeding the limit must show an inline validation error in the storefront.
7. Quantity changes must recalculate the line total server-side; prices are not taken from the client.
8. Adding the same product/variant/wrap/message combination must increment quantity, not add a duplicate line.

## Dependencies

- `gift_catalog` module — `gift_message_max_length` per product
- Open Mercato `catalog` module — product/variant price lookup
- [FEAT-004](FEAT-004-checkout-orders.md) — cart converts to order at checkout
- [FEAT-005](FEAT-005-customer-accounts.md) — customer session for cart adoption

## Evidence

- `apps/mercato/src/modules/storefront/data/entities.ts` — cart entities
- `apps/mercato/src/modules/storefront/__tests__/pricing.test.ts` — pricing unit tests
- `apps/storefront/src/components/cart/` — cart UI components
- `apps/storefront/docs/backend-api-contract.md` §Cart — API contract
- `apps/storefront/__integration__/storefront-and-admin.spec.ts` — Cart section

## Known Limitations

- Cart line deduplication is based on `line_key` — gift wrap and message changes create new lines rather than updating the existing one (by design).
- Customizable product designs are not yet stored on cart lines ("Personalisation will be available with our 3D designer soon" message shown).
