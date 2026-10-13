---
id: TASK-06
title: Cart feature — cart screen + optimistic cart state
status: Done (sandbox-verified — see spec/mobile/IMPLEMENTATION-NOTES.md)
---

# TASK-06 — Cart feature

## Objective

Build the Cart screen and a reusable cart hook with optimistic updates, mirroring `apps/storefront/src/lib/cart/cart-context.tsx`'s behavior. Ports FEAT-003 (Shopping Cart).

## Boundaries

**You own (overwrite TASK-01's stub, then everything else under this path):** `apps/mobile/src/features/cart/**`, specifically:
- `src/features/cart/screens/CartScreen.tsx`
- `src/features/cart/hooks/useCart.ts` (the shared hook — **this is the one file other tasks import from**, see Contracts produced)
- Any local components, e.g. `src/features/cart/components/CartLineRow.tsx`.

**Do not touch:** `src/lib/api/**`, `src/components/ui/**`, `src/theme/**`, navigation, `package.json`/`app.json`.

## Contracts consumed

From TASK-04's `cart.ts`: `getCart`, `replaceCartLines`, `clearCart`, `addCartLine`, `updateCartLine`, `removeCartLine`, and the `Cart`/`CartLine`/`CartLineInput`/`CartLineIssue` types.

From TASK-03's `money.ts`: `formatMoney`, `toMinorUnits` (for any local arithmetic, e.g. showing a running total as line quantities change before the server responds).

From TASK-02: `Button`, `Card`, `PriceText`, `LoadingState`, `EmptyState`, `ErrorState`.

## Contracts produced (TASK-05 and TASK-07 import this)

`src/features/cart/hooks/useCart.ts`:
```ts
export interface UseCartResult {
  cart: Cart | undefined
  isLoading: boolean
  error: ApiError | null
  addLine: (input: CartLineInput) => Promise<void>
  setQuantity: (lineId: string, quantity: number) => Promise<void>
  updateGift: (lineId: string, patch: { giftWrap?: boolean; giftMessage?: string }) => Promise<void>
  removeLine: (lineId: string) => Promise<void>
  clear: () => Promise<void>
}
export function useCart(): UseCartResult
```
Built on `@tanstack/react-query` (`useQuery` for `getCart`, `useMutation` + optimistic cache updates + rollback-on-error for the mutating actions — same pattern as the web storefront's `cart-context.tsx`). TASK-05's Product Detail add-to-cart button and TASK-07's checkout screen both call `useCart()` directly rather than re-implementing cart state.

## Backend endpoints used

- `GET /api/storefront/cart`
- `POST /api/storefront/cart/lines`
- `PUT /api/storefront/cart/lines/{lineId}`
- `DELETE /api/storefront/cart/lines/{lineId}`
- `DELETE /api/storefront/cart` (clear)
- `PUT /api/storefront/cart` (only if you need a bulk-replace path; the per-line endpoints above cover the normal UI flows)

## Acceptance criteria (ported from FEAT-003)

- Cart persists across app restarts (relies on the backend's `sf_cart_token` cookie being retained by the native HTTP stack between sessions — verify this manually once TASK-01's scaffold exists, since this is the one behavior that depends on a runtime assumption documented in TASK-03).
- Works fully for an anonymous/guest user — no login required anywhere in this flow.
- Gift wrap and gift message are editable per line, independently of other lines.
- A gift message exceeding the product's `giftMessageMaxLength` (from TASK-05's product data) shows an inline validation error before the request is sent — but this screen still implements graceful handling of the server-side `cart_invalid` (422) response too, since a message length limit could differ by variant/profile.
- Quantity changes are optimistic (UI updates immediately) and roll back with a visible error if the server rejects the change.
- Adding the identical product+variant+giftWrap+giftMessage combination increments the existing line's quantity rather than creating a duplicate line (this is actually enforced server-side by `POST /cart/lines`'s merge behavior — just don't fight it client-side).
- Empty cart renders `EmptyState` with a CTA back to the catalog (navigate to `CatalogStackParamList.ProductList`).

## Dependencies to add

```
@tanstack/react-query
```

## Non-goals

- No guest-to-customer cart merge-on-login (there is no login in this pass — this becomes relevant only once TASK-08's "real auth" fast-follow happens).
