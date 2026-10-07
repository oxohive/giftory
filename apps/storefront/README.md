# Gift storefront

Customer storefront for the gift marketplace. It's a standalone Next.js 16 (App Router) app that talks to the Open Mercato backend only over HTTP.

## Run it

Prerequisites: Node 22+, and the Open Mercato backend (`apps/mercato`) running on http://localhost:3000 with the `storefront` module enabled (see section 9 of the [backend contract](docs/backend-api-contract.md)).

```bash
npm install
cp .env.example .env.local   # set MERCATO_ORGANIZATION_ID (or MERCATO_ORGANIZATION_SLUG); payment keys are optional
npm run dev                  # http://localhost:3100
```

Checks:

```bash
npm run typecheck            # tsc --noEmit
npm run lint
npm run build && npm start   # production build on http://localhost:3100
```

No API key is needed. Catalog pages call the public `/api/storefront/catalog/*` routes, and the backend resolves the shop from `MERCATO_ORGANIZATION_ID` or `MERCATO_ORGANIZATION_SLUG`. If you have an old `.env.local`, delete its `MERCATO_STOREFRONT_API_KEY` line, which is no longer read.

## How it talks to the backend

- The backend API contract, the gap list and the required backend config are in [`docs/backend-api-contract.md`](docs/backend-api-contract.md).
- Catalog pages are server components. They fetch the public storefront catalog at request time (`src/lib/api/catalog.ts`).
- Browser calls go through the BFF proxy at `src/app/api/om/[...path]/route.ts`. It keeps the customer, cart (`sf_cart_token`) and guest-order (`sf_order_access`) cookies first-party, so no CORS is needed.
- The cart is the backend's server-side cart (`src/lib/cart/cart-context.tsx` and `src/lib/api/cart.ts`). It is server-priced, survives login (the backend merges the anonymous cart into the account), and is checked out as a whole by `POST /api/storefront/checkout/orders`.
- Checkout (`src/components/checkout/checkout-form.tsx`) uses one `Idempotency-Key` per attempt, kept in sessionStorage. If a payment fails or is dismissed, it retries payment on the existing order instead of placing a new one.
