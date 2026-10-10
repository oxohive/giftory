# Giftory — AI Agent Instructions

Gift marketplace built on Open Mercato 0.8.0. See [docs/architecture.md](docs/architecture.md) for the full architecture and [spec/](spec/) for feature specifications and user stories.

## Repository Layout

```
apps/mercato/     # Backend + admin (Open Mercato), port 3000
apps/storefront/  # Customer storefront (Next.js), port 3100
docs/             # Architecture and decision documents
spec/             # Feature specs, user stories, ADRs (spec-driven development)
  phase-1/        # Phase 1 — Commerce Foundation (implemented)
  phase-2/        # Phase 2 — Dealer Marketplace (planning)
  decisions/      # Architecture Decision Records (ADR-XXX)
```

Each app has its own `AGENTS.md` with detailed rules — read those before editing.

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

**Phases 2–9 — Planned.** Dealer marketplace, 3D customization, production workflow, AI gift assistant, corporate gifting, and more. See [docs/architecture.md](docs/architecture.md#19-stack-by-phase) for the roadmap.
