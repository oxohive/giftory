# Gift App

Gift marketplace with 3D customization. Product plan: [docs/Gift_Marketplace_Complete_Phased_Plan.docx](docs/Gift_Marketplace_Complete_Phased_Plan.docx). Architecture: [docs/architecture.md](docs/architecture.md). Current state: [docs/phase-2-status.md](docs/phase-2-status.md).

**Status:** Phase 1 (Commerce Foundation) implemented, deployed. Phase 2 dealer marketplace implemented and deployed — backend on ECS (`admin.giftory.dev.oxohive.com`), storefront and dealer portal on Vercel.

## Layout

| Path | What | Port |
|---|---|---|
| `apps/mercato` | Backend + admin: Open Mercato 0.8.0 with the Gift App modules | 3000 |
| `apps/storefront` | Customer storefront (Next.js) — deployed to Vercel: `giftory-storefront.vercel.app` | 3100 |
| `apps/mobile` | Customer storefront (Expo/React Native) — Phase 1 port, guest-only, Razorpay only. **Verified live on a physical device** (catalog/cart/nav); Razorpay payment itself not yet verified — see [apps/mobile/README.md](apps/mobile/README.md) | 8081 (Metro) |
| `apps/dealer-portal` | Dealer portal (Next.js) — deployed to Vercel: `giftory-blue.vercel.app` | 3200 |
| `packages/` | Shared `api-client` and `ui` packages used by the portal apps | — |

Gift App modules live in `apps/mercato/src/modules/`:

| Module | Purpose |
|---|---|
| `gift_catalog` | Gift occasions and per-product gift profiles (occasions, recipients, customizable, proof required, gift wrap, message length); admin pages + product-form widget |
| `storefront` | Public catalog, server-side cart, checkout/order placement, payment sessions, customer order history, address book |
| `gateway_razorpay` | Razorpay payment gateway (UPI, cards, netbanking) next to the native Stripe gateway |
| `dealer_onboarding` | Dealer self-registration, KYC documents, admin approve/reject, resubmission (FEAT-008) |
| `dealer_org_rbac` | Dealer organization access control, production capabilities, staff invitations, admin dealer directory (FEAT-009) |
| `dealer_orders` | Manual order assignment/reassignment/cancellation and dealer production status transitions (FEAT-011) |
| `commissions` | Commission rules, immutable per-order snapshots, dealer earnings (FEAT-012) |
| `payouts` | Append-only dealer ledger, balances, manual payout recording, adjustments (FEAT-013) |

Dealer marketplace endpoints are documented in [docs/dealer-marketplace-api.md](docs/dealer-marketplace-api.md).

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

# Dealer portal (scaffold): http://localhost:3200
cd apps/dealer-portal
npm install
npm run dev
```

## Database (Supabase)

- The backend connects to Supabase Postgres through the **IPv4 session pooler** (`aws-0-ap-south-1.pooler.supabase.com:5432`, user `postgres.<project-ref>`). The direct host `db.<ref>.supabase.co` is IPv6-only and caused DNS failures and timeouts on this network. Keep `DB_POOL_MAX` low (8) because of the pooler's connection limit. It does not use the Supabase Data API.
- The Data API roles (`anon`, `authenticated`) have **no access** to the `public` schema. Don't grant it back: these tables hold users, orders and addresses.
- Schema changes: `yarn db:generate` → review the migration → `yarn db:migrate`.
- **Warning:** `yarn mercato init` (re)initializes the database. It ignores `--help`.

## Attachment storage (S3)

KYC documents (`dealer_onboarding`) and catalog product images persist in AWS S3 (bucket `giftory-dev-kyc-documents`, private, SSE-KMS, 7-year lifecycle retention — see `infra/storage.tf`). Enabling it locally or re-pointing an environment at it needs three separate steps, each independently necessary:

1. Set `OM_ENABLE_STORAGE_S3=true` **before** `yarn generate`/the Docker build runs — module enablement is baked in at generate/build time, not read from the environment at request time.
2. Bootstrap per-tenant credentials into the DB: `yarn mercato storage_s3 configure-from-env --tenant <id> --org <id>` (or `--all-tenants`), with `OM_INTEGRATION_STORAGE_S3_{ACCESS_KEY_ID,SECRET_ACCESS_KEY,BUCKET,REGION}` exported. This is a one-time seed, not something re-read on every request.
3. Point the attachment partition(s) at the `s3` driver — this is a separate per-partition DB setting (`attachment_partitions.storage_driver`) from the tenant credentials above; a fresh install seeds every partition as `local` regardless of step 2.

Public partitions (`isPublic: true`, e.g. `productsMedia`) are served anonymously through an app-level override of the core attachments routes (`apps/mercato/src/app/api/attachments/{file/[id],image/[id]/[[...slug]]}/route.ts`) — the vendored framework routes deny unauthenticated access to any tenant/org-scoped attachment even on a public partition, which blocks the storefront's plain `<img src>` requests for product photos. Private partitions are unaffected.

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
| [docs/phase-2-status.md](docs/phase-2-status.md) | Current project status: what is done, what is in progress, what is left |
| [docs/dealer-marketplace-api.md](docs/dealer-marketplace-api.md) | Phase 2 dealer API reference, money flow and known gaps |
| [docs/phase-2-testing-guide.md](docs/phase-2-testing-guide.md) | Live end-to-end checklist for the dealer flows (not yet executed) |
| [tasks/phase-2-ui/](tasks/phase-2-ui/README.md) | 19-task plan for the dealer portal and admin UI |
| [docs/features/](docs/features/) | Per-feature specifications (status, requirements, acceptance criteria) |
| [tasks/](tasks/) | User stories and engineering tasks |
| [apps/storefront/__integration__/storefront-and-admin.spec.ts](apps/storefront/__integration__/storefront-and-admin.spec.ts) | Phase 1 Playwright end-to-end test suite (storefront + admin) |
| [apps/storefront/docs/backend-api-contract.md](apps/storefront/docs/backend-api-contract.md) | Storefront API contract (verified against the running backend) |
| [spec/mobile/README.md](spec/mobile/README.md) | Mobile app task breakdown, status, and [IMPLEMENTATION-NOTES.md](spec/mobile/IMPLEMENTATION-NOTES.md) for every discrepancy/open item |

## Payments

Put **test** keys in `apps/mercato/.env`:

- Stripe: `OM_INTEGRATION_STRIPE_PUBLISHABLE_KEY`, `OM_INTEGRATION_STRIPE_SECRET_KEY`, `OM_INTEGRATION_STRIPE_WEBHOOK_SECRET`. Webhook: `/api/payment_gateways/webhook/stripe`
- Razorpay: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Webhook: `/api/payment_gateways/webhook/razorpay`. Then run `yarn mercato gateway_razorpay configure-from-env --tenant <id> --org <id>`.

Webhooks need a public HTTPS URL (e.g. a tunnel) in development.
