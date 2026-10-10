# Gift App

Gift marketplace with 3D customization. Product plan: [docs/Gift_Marketplace_Complete_Phased_Plan.docx](docs/Gift_Marketplace_Complete_Phased_Plan.docx). Architecture: [docs/architecture.md](docs/architecture.md).

**Status:** Phase 1 (Commerce Foundation) implemented.

## Layout

| Path | What | Port |
|---|---|---|
| `apps/mercato` | Backend + admin: Open Mercato 0.8.0 with the Gift App modules | 3000 |
| `apps/storefront` | Customer storefront (Next.js) | 3100 |

Gift App modules live in `apps/mercato/src/modules/`:

| Module | Purpose |
|---|---|
| `gift_catalog` | Gift occasions and per-product gift profiles (occasions, recipients, customizable, proof required, gift wrap, message length); admin pages + product-form widget |
| `storefront` | Public catalog, server-side cart, checkout/order placement, payment sessions, customer order history, address book |
| `gateway_razorpay` | Razorpay payment gateway (UPI, cards, netbanking) next to the native Stripe gateway |

## Prerequisites

- Node.js ≥ 24
- Yarn 4 through corepack for the backend: `corepack enable` (or `corepack enable --install-directory ~/.local/bin` without admin rights)
- The Supabase Postgres connection is configured in `apps/mercato/.env` (not committed)

## Run

```bash
# Backend + admin: http://localhost:3000/backend
cd apps/mercato
yarn install
yarn dev:classic

# Storefront: http://localhost:3100
cd apps/storefront
npm install
npm run dev
```

## Database (Supabase)

- The backend connects to Supabase Postgres through the **IPv4 session pooler** (`aws-0-ap-south-1.pooler.supabase.com:5432`, user `postgres.<project-ref>`). The direct host `db.<ref>.supabase.co` is IPv6-only and caused DNS failures and timeouts on this network. Keep `DB_POOL_MAX` low (8) because of the pooler's connection limit. It does not use the Supabase Data API.
- The Data API roles (`anon`, `authenticated`) have **no access** to the `public` schema. Don't grant it back: these tables hold users, orders and addresses.
- Schema changes: `yarn db:generate` → review the migration → `yarn db:migrate`.
- **Warning:** `yarn mercato init` (re)initializes the database. It ignores `--help`.

## Seed data

```bash
cd apps/mercato
yarn mercato gift_catalog seed-occasions --tenant <tenantId> --org <orgId>
yarn mercato gift_catalog seed-demo      --tenant <tenantId> --org <orgId>
```

## Documentation

| Document | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Full system architecture, tech stack, data model, roadmap |
| [docs/features/](docs/features/) | Per-feature specifications (status, requirements, acceptance criteria) |
| [tasks/](tasks/) | User stories and engineering tasks |
| [apps/storefront/__integration__/storefront-and-admin.spec.ts](apps/storefront/__integration__/storefront-and-admin.spec.ts) | Phase 1 Playwright end-to-end test suite (storefront + admin) |
| [apps/storefront/docs/backend-api-contract.md](apps/storefront/docs/backend-api-contract.md) | Storefront API contract (verified against the running backend) |

## Payments

Put **test** keys in `apps/mercato/.env`:

- Stripe: `OM_INTEGRATION_STRIPE_PUBLISHABLE_KEY`, `OM_INTEGRATION_STRIPE_SECRET_KEY`, `OM_INTEGRATION_STRIPE_WEBHOOK_SECRET`. Webhook: `/api/payment_gateways/webhook/stripe`
- Razorpay: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Webhook: `/api/payment_gateways/webhook/razorpay`. Then run `yarn mercato gateway_razorpay configure-from-env --tenant <id> --org <id>`.

Webhooks need a public HTTPS URL (e.g. a tunnel) in development.
