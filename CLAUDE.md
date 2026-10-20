# Giftory — AI Agent Instructions

Gift marketplace built on Open Mercato 0.8.0. See [docs/architecture.md](docs/architecture.md) for the full architecture and [spec/](spec/) for feature specifications and user stories.

## Repository Layout

```
apps/mercato/       # Backend + admin (Open Mercato), port 3000
apps/storefront/    # Customer storefront (Next.js), port 3100 — deployed to Vercel
apps/dealer-portal/ # Dealer-facing portal (Next.js) — deployed to Vercel, calls apps/mercato's API directly
apps/mobile/        # Customer storefront (Expo/React Native), Phase 1 port — guest-only, Razorpay only, verified live on a physical device (catalog/cart/nav); Razorpay payment itself not yet verified (see apps/mobile/README.md)
infra/              # OpenTofu (Terraform) — AWS ECS Fargate + CodeBuild CI/CD + S3 + Vercel + DNS
docs/             # Architecture and decision documents
spec/             # Feature specs, user stories, ADRs (spec-driven development)
  phase-1/        # Phase 1 — Commerce Foundation (implemented)
  phase-2/        # Phase 2 — Dealer Marketplace (implemented)
  mobile/         # Mobile app task breakdown + implementation notes
  decisions/      # Architecture Decision Records (ADR-XXX)
```

Each app has its own `AGENTS.md` with detailed rules — read those before editing. `apps/mobile` has no `AGENTS.md` yet (it's a standalone app outside the Open Mercato module system this file otherwise governs) — its own `README.md` is the entry point.

## Setup

```bash
# Backend
cd apps/mercato && yarn install && yarn dev:classic

# Storefront
cd apps/storefront && npm install && npm run dev
```

Requires Node.js ≥ 24 for `apps/mercato`, ≥ 22 for `apps/storefront`. Database is Supabase PostgreSQL 17 (connection configured in `apps/mercato/.env`).

## Commands — `apps/mercato`

| Command | Purpose |
|---|---|
| `yarn generate` | Regenerate after changing modules.ts, routes, entities, agents, workflows |
| `yarn db:generate` | Generate a MikroORM migration after entity changes |
| `yarn db:migrate` | Apply pending migrations |
| `yarn typecheck` | TypeScript check |
| `yarn lint` | ESLint |
| `yarn test` | Jest unit tests |
| `yarn test:integration` | Playwright integration tests |
| `yarn build` | Production build |

## Commands — `apps/storefront`

| Command | Purpose |
|---|---|
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run build` | Production build |

## Conventions

- **Multi-tenancy:** every query must scope to `tenantId` + `organizationId`. Never trust scope from the request payload; derive it from the session or resolved context.
- **Money:** store as integer minor units (paise) in all app-owned DB columns (`numeric(18,0)`). All arithmetic goes through `toMinor()`/`fromMinor()` in `pricing.ts`. Open Mercato commands and APIs receive decimal major units (their contract); convert at that boundary only. Never use raw JS float arithmetic on monetary values.
- **Idempotency:** POST endpoints that create orders or payments require an `Idempotency-Key` header.
- **Migrations:** run `yarn db:generate`, review the generated SQL, then `yarn db:migrate`. Never edit shipped migrations.
- **Discovery files:** run `yarn generate` whenever you change `src/modules.ts`, route files, entity files, agent files, or workflow files.
- **Module isolation:** app modules live in `apps/mercato/src/modules/<id>/`. Do not use cross-module ORM relations — communicate via IDs, snapshots, events, or enrichers.
- **Import style:** use bare extensions for local TypeScript imports (`from '../data/entities'`, not `from '../data/entities.js'`). Turbopack (Next.js production build) cannot resolve explicit `.js` extensions on TypeScript source files. For imports that cross module boundaries (`../../other-module/...`), use the `@/modules/other-module/...` alias instead of relative paths — it avoids path-depth counting bugs and is immune to directory restructuring.
- **Soft delete:** all business entities use `deleted_at`. Use hard delete only for PII removal requests.
- **Secrets:** never commit secrets or credentials. Use environment variables documented in `.env.example` files.

## Before Editing

1. Read the app-level `AGENTS.md` for the app you are working in.
2. Read the relevant feature spec in `spec/phase-N/features/` if one exists.
3. Check existing tests to understand verified behavior.
4. Run `yarn generate` if you change discovery files in `apps/mercato`.

## Security Requirements

- Never expose `tenantId`, `organizationId`, or user PII in logs or error responses.
- Do not weaken authentication, rate limiting, idempotency, or audit logging.
- Do not commit credentials, JWT secrets, or API keys.
- Do not grant Data API roles (`anon`, `authenticated`) access to the `public` schema in Supabase.

## Documentation Updates

When you change behavior, API contracts, or entity schemas:
- Update the relevant `spec/phase-N/features/FEAT-XXX-*.md` file.
- Update `apps/storefront/docs/backend-api-contract.md` for storefront API changes.
- Mark user stories in `spec/phase-N/stories/` as Done when their acceptance criteria are met.

## Phase Status

**Phase 1 (Commerce Foundation) — Implemented.** Gift catalog, occasions, server-side cart, checkout, Stripe + Razorpay payments, customer accounts, address book, order history, admin gift management.

**Phase 2 (Dealer Marketplace) — Implemented.** Dealer self-registration + admin KYC review (`dealer_onboarding`), dealer org RBAC with staff invites (`dealer_org_rbac`), manual order assignment (`dealer_orders`), commission engine with rules and earnings API (`commissions`). Dealer self-registration is invite-link only (`https://<dealer-portal>/onboarding/register?organizationId=<root-org-id>`) — there is deliberately no public "become a dealer" link in the UI; a new dealer organization is created fresh under the resolved tenant, it does not reuse the `organizationId` from the link.

KYC documents and catalog product images persist in S3 (see Infrastructure below) — both partitions were local-disk-only (ephemeral, wiped on every scale-to-zero/redeploy) until 2026-10-20.

**Phases 3–9 — Planned.** 3D customization, production workflow, AI gift assistant, corporate gifting, and more. See [docs/architecture.md](docs/architecture.md#19-stack-by-phase) for the roadmap.

## Infrastructure

`apps/mercato` runs on AWS ECS Fargate Spot with scale-to-zero (Mumbai, `ap-south-1`). `apps/storefront` and `apps/dealer-portal` deploy to Vercel. Infrastructure is managed with OpenTofu in `infra/` (`storage.tf`, `vercel.tf`, `dns.tf`, `codebuild.tf`, `ecs.tf`, etc.) — CI/CD is CodeBuild, a push to `main` that touches `apps/` triggers test → Docker build → ECR push → ECS deploy automatically (`buildspec.yml`).

- **Backend ALB:** `http://giftory-dev-alb-398957740.ap-south-1.elb.amazonaws.com` (public host: `admin.giftory.dev.oxohive.com`)
- **ECR:** `767398004313.dkr.ecr.ap-south-1.amazonaws.com/giftory-mercato`
- **CodeBuild compute:** `BUILD_GENERAL1_LARGE` (15 GB RAM) — `next build`'s page-data collection step was OOM-killed on the previous `BUILD_GENERAL1_MEDIUM` (7 GB) once the `storage_s3` module's ~18 AWS SDK packages were added across 619 API routes.
- **Secrets:** stored in SSM Parameter Store under `/giftory/dev/` as `SecureString`
- **Scale-to-zero:** EventBridge watchdog scales ECS to 0 after 30 min idle; Lambda wakeup scales it back to 1 on first request. Any direct `aws ecs update-service`/`register-task-definition` against a cold service will transiently fail with "target group does not have an associated load balancer" — wake the backend first (hit `/api/healthz` until it stops returning the wakeup page), then retry.
- **Dealer portal:** `https://giftory-blue.vercel.app` (Vercel project literally named `giftory`, not `giftory-dealer-portal`) — created manually via the Vercel dashboard, not yet imported into Terraform state (the `vercel_project.dealer_portal` resource in `infra/vercel.tf` exists but `tofu import` is blocked by an unrelated full-graph evaluation issue; the real deployment works correctly, it's just untracked by IaC). Needs `installCommand` set to `npm install && npm install --prefix ../../packages/ui --legacy-peer-deps` (no workspace config in this repo, so `packages/ui`'s own deps are never installed by a plain `npm install`) and `OM_API_BASE_URL` pointed at the backend ALB host.
- **Attachment storage (S3):** bucket `giftory-dev-kyc-documents` (`infra/storage.tf`) — private, SSE-KMS by default, versioned, 7-year lifecycle backstop, dedicated IAM user (`giftory-dev-storage-s3`) scoped to only this bucket. Credentials are bootstrapped per-tenant into the DB via `yarn mercato storage_s3 configure-from-env --all-tenants` (reads `OM_INTEGRATION_STORAGE_S3_*` env vars at run time) — this is a one-time seeding step, not something re-read from the environment on every request.
  - **Module enablement is a Docker build-time concern, not a runtime one.** `OM_ENABLE_STORAGE_S3=true` must be set before `yarn generate` runs inside the Dockerfile's `builder` stage (it's baked in as an `ENV` line there) — setting it only as an ECS task env var silently no-ops, since the module registration itself happens at generate/build time.
  - **Which attachment partition actually uses S3 is a separate, per-partition DB setting** (`attachment_partitions.storage_driver`, values `local`/`s3`), independent of whether S3 credentials are configured for the tenant. Both `privateAttachments` (KYC documents) and `productsMedia` (catalog images) are set to `s3`. A fresh Open Mercato install seeds new partitions as `local` by default — don't assume configuring tenant credentials alone moves existing data/partitions onto S3.
  - **The bucket policy must not require an explicit `x-amz-server-side-encryption` header on `PutObject`** — the installed `@open-mercato/storage-s3` driver never sets that header; it relies entirely on the bucket's own default SSE-KMS encryption, which already covers every object regardless of client headers. A stricter "deny unencrypted uploads" policy statement will reject every real upload from this driver.
  - **Public-partition attachments (`isPublic: true`, e.g. `productsMedia`) need an app-level route override to actually be viewable anonymously.** The vendored `@open-mercato/core` attachments file/image routes deny any request for a tenant/org-scoped attachment unless authenticated — even on a public partition — and every attachment created through the normal upload flow is scoped, so this effectively blocked anonymous storefront `<img>` requests for product photos. Fixed via `apps/mercato/src/app/api/attachments/{file/[id],image/[id]/[[...slug]]}/route.ts`, which skip the access check only when `partition.isPublic` and defer to the unmodified upstream check otherwise (private partitions are unaffected). Don't hand-edit the vendored routes in `node_modules/@open-mercato/core` — this app-level override pattern (a file at the same path under `src/app/api/...`) is how the app is meant to customize framework routes; see also `src/app/api/auth/login/route.ts` for the same pattern.
  - **Product images uploaded before 2026-10-20 are very likely unrecoverable.** They were written to the old local-disk driver, which is wiped on every scale-to-zero cycle and redeploy; several of both occurred between upload and today. Any product with an existing image needs it re-uploaded now that storage actually persists.
