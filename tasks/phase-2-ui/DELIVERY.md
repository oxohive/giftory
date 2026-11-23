# Phase 2 dealer marketplace: delivery and deployment readiness (P2-UI-18)

Written 2026-11-23 by workstream WS-G (branch `m1/ws-g`, based on `milestone-1-hardening`, which sits on `main` at `5bb2a3c`).

Every statement here was checked against the repository: code, `infra/`, git history and the recorded test evidence. When something could not be checked from the repository, this document says so. Nobody deployed anything, changed infrastructure, ran a migration or called a deployed app while writing it.

## 1. Implemented, tested and deployed are three different claims

| Component | Implemented on `main` | Tested | Deployed |
|---|---|---|---|
| Backend modules `dealer_onboarding`, `dealer_org_rbac`, `dealer_orders`, `commissions`, `payouts` (`apps/mercato`) | Yes (PR #2, `37d61f7`) | **Unit:** `yarn test` in `apps/mercato` was 638/638 on 2026-10-20 (VERIFICATION.md). The coordinator re-ran it on 2026-11-23: 637/638, with 1 Windows-only path-separator failure. **Integration:** 12/12 on 2026-10-20, API-level, against a disposable local Postgres and a production build (see §4) | Partly. CI deploys every push to `main` to ECS (`buildspec.yml`), so the code is very likely running at `admin.giftory.dev.oxohive.com`. **But the database schema it needs is not there.** The image never runs migrations (§5.1), and as of 2026-10-20 the dealer tables did not exist in the shared dev database (VERIFICATION.md §2.4). Nobody has re-checked since. Dealer onboarding should be treated as non-functional in every real environment until the migrations are applied. |
| Admin screens: KYC review, dealer directory, assignment tab, commissions, payouts (`apps/mercato` backend pages) | Yes | Unit/static tests only. **Never rendered in a browser by any test.** | Same image as the backend, so the same caveat applies |
| Dealer portal (`apps/dealer-portal`, 18 pages) | Yes | `npm test` 300/300, typecheck clean, lint 0 errors (2 known warnings), `npm run build` succeeds. All re-run locally on 2026-11-23. **Never rendered in a browser by any test.** The 12/12 run did not go through its BFF proxy. | According to `CLAUDE.md` and `README.md` it runs at `https://giftory-blue.vercel.app` (Vercel project `giftory`, created by hand). Not checked tonight, because HTTP calls to deployed apps were out of scope. The matching Terraform resource exists but has not been applied or imported (§5.4). |

## 2. Hosts and what connects to what

```
browser ──HTTPS──▶ dealer portal (Vercel, Next.js)
                     └─ /api/om/*  (BFF proxy, server-side, allowlisted routes only)
                          ──HTTPS──▶ apps/mercato backend (AWS ECS Fargate behind ALB)
                                       └─▶ Supabase Postgres, S3 (KYC files), email provider
admin browser ──HTTPS──▶ apps/mercato /backend (same ECS service)
```

- **Backend:** ECS service `mercato-dev` in cluster `giftory-dev`, region `ap-south-1`, image from ECR `giftory-mercato`. The ALB has an HTTPS listener with an ACM certificate (`infra/alb.tf`, `infra/dns.tf`), public host `admin.giftory.dev.oxohive.com`. The service scales to zero after 30 minutes idle and a Lambda wakes it on the next request, so the first request after idle is slow.
- **Dealer portal:** Next.js 16 on Vercel. The browser only ever talks to the portal's own origin. The BFF proxy (`apps/dealer-portal/src/app/api/om/[...path]/route.ts`) forwards an explicit allowlist of dealer-facing and shared-auth routes to `OM_API_BASE_URL`. Admin routes are never proxied.
- **Sessions and cookies:** the backend sets `auth_token` and `session_token` as host-only cookies (`httpOnly`, `SameSite=Lax`, and `Secure` when `NODE_ENV=production`; see `@open-mercato/core` `auth/api/login.js`). The proxy passes these `Set-Cookie` headers through unchanged, so the cookies end up first-party on the portal's origin. **No cookie-domain setting is needed on either side, and the backend needs no CORS.** Because the cookies are `Secure` in production, the portal must be served over HTTPS (Vercel does this).
- **CSRF:** the proxy rejects any mutating request whose `Origin` doesn't match the portal's own origin. It works out that origin from `x-forwarded-proto` and `x-forwarded-host`, so any CDN or proxy in front of the portal must forward those headers. Vercel does.

## 3. Environment variables

### 3.1 Backend (`apps/mercato`), Phase-2-relevant subset

"In `infra/ecs.tf`?" means the ECS task definition in Terraform sets the variable. Whether the live task definition matches Terraform could not be checked.

| Variable | Purpose | Required in production | In `infra/ecs.tf`? |
|---|---|---|---|
| `DATABASE_URL` | Postgres | yes | yes (SSM secret) |
| `JWT_SECRET`, `AUTH_SECRET` | session signing | yes | yes (SSM secret) |
| `TENANT_DATA_ENCRYPTION_FALLBACK_KEY` | at-rest encryption, including dealer `gstin`/`pan` (`dealer_onboarding/encryption.ts`) | yes | yes (SSM secret) |
| `OM_ENABLE_STORAGE_S3` | enables S3 attachment storage. **Read at build time** by `yarn generate`, which is why it is also set in the `Dockerfile` | yes | yes (and in `Dockerfile`) |
| `OM_INTEGRATION_STORAGE_S3_BUCKET`, `_REGION`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY` | S3 for KYC files | yes | yes |
| `APP_URL` | base URL for core-auth emails. That includes the **dealer owner invite / first-password link** and the **staff invite link** (`getSecurityEmailBaseUrl()`). `.env.example`: "required in production for security-sensitive email links" | yes | **no** |
| `DEALER_PORTAL_BASE_URL` | base URL for dealer approval, rejection and assignment emails (`dealer_onboarding/lib/url.ts`, `dealer_orders/lib/url.ts`). **These throw if it is unset while `NODE_ENV=production`** | yes | **no**, and not in any `.env.example` either |
| `PLATFORM_PORTAL_BASE_URL` | Phase 1 customer-portal email links | yes (Phase 1) | **no** |
| `SYSTEM_EMAIL_PROVIDER` + `RESEND_API_KEY`, **or** `SYSTEM_EMAIL_PROVIDER=ses` + `AWS_SES_REGION` | outbound email transport (`.env.example` lines 44–63) | yes, if any email is to be sent | **no** |
| `NOTIFICATIONS_EMAIL_FROM` / `EMAIL_FROM` / `ADMIN_EMAIL` | sender address. Without one, `@open-mercato/shared`'s `isEmailDeliveryConfigured()` returns false and **no mail is sent** | yes | **no** |

**What follows, if the live task definition matches `infra/ecs.tf`:** the deployed backend cannot send any email. A dealer who registers creates a user with no password, and the only way to set one is the invite email. So a newly registered dealer could never log in unless someone sets a password for them by hand. This is a deduction from the code and the Terraform, not something observed. A human with AWS access should compare it against the live task definition (see §7).

### 3.2 Dealer portal (`apps/dealer-portal`)

| Variable | Purpose | Notes |
|---|---|---|
| `OM_API_BASE_URL` | the backend base URL for the BFF proxy. Server-only; never sent to the browser | Terraform (`infra/vercel.tf`) would set it to `https://admin.giftory.dev.oxohive.com`. `CLAUDE.md` says the hand-made project points it at "the backend ALB host". Which value is live could not be checked. Use the HTTPS hostname. |
| `DEALER_TENANT_ID` | reserved; **no code reads it** (`.env.example` says so) | leave unset |

There are no `NEXT_PUBLIC_*` variables. Nothing about the backend is baked into the client bundle.

## 4. What the 12/12 integration run proves, and what it doesn't

`apps/mercato/src/modules/dealer_orders/__integration__/dealer-marketplace-journey.spec.ts`, run with `yarn test:integration:ephemeral` (needs Docker; it boots a disposable Postgres and a production build).

It proves, with real HTTP and real Postgres in a local environment:
- registering two dealers in one tenant
- invite password setup, using emails captured by the test channel rather than real delivery
- multipart KYC upload
- approve-before-review returning 400
- reject → resubmit → approve
- an owner setting capabilities, and staff getting 403 when they try
- staff invite and deactivate, after which the deactivated user can no longer log in
- an assignment with `Idempotency-Key`, which wrote one commission snapshot row and one `commission_earned` ledger row
- dealer earnings, balance, dashboard and orders list
- same-tenant cross-dealer isolation
- the full status sequence to `dispatched`, after which `dispatched` is terminal
- a payout returning 201

It does **not** prove:
- anything about the deployed environment
- anything rendered in a browser, including accessibility and responsiveness
- the dealer portal's BFF proxy
- real payment capture (the paid order was inserted directly into SQL)
- real email delivery
- commission-rule precedence or non-zero amounts (no rule existed, so the snapshot resolved to 0 bps)
- reassign and cancel
- adjustments
- balance arithmetic (the values were not asserted)
- isolation across a second tenant
- the Phase 1 regression suite

## 5. Deployment plan (for a human to execute; nothing here has been run)

### 5.1 Facts the plan depends on

- **Deploys do not run migrations.** The production image's `CMD` is `yarn start`, which is `mercato server start`, and the CLI's production path only spawns `next start` and the workers. `docker/scripts/init-or-migrate.sh` is copied into the image, but only the dev entrypoint and `docker-compose.fullapp*.yml` call it. The production `CMD` never does. `buildspec.yml` runs unit tests, builds, pushes and runs `aws ecs update-service`; it has no migration step. Migrations therefore have to be applied separately. **As of the last recorded check (2026-10-20), code on `main` was ahead of the shared dev database's schema.**
- Unapplied Phase 2 migrations:
  - `dealer_onboarding/migrations/Migration20261013232854_dealer_onboarding.ts` creates `dealer_profiles` and `dealer_kyc_documents`. **It has no `down()`.**
  - `dealer_org_rbac/migrations/Migration20261013232900_dealer_org_rbac.ts` creates `dealer_capabilities`. **It has no `down()`.**
  - `payouts/migrations/Migration20261020123600_payouts.ts` makes `dealer_ledger_entries.created_by` nullable, and does have a `down()`. Without it, every commission ledger credit fails silently (VERIFICATION.md, Update item 3).
- A separate Milestone 1 workstream (WS-E, under `tasks/milestone-1/`) is reviewing these migrations and writing a runbook for applying them. Use that runbook where it exists. This document does not repeat its contents or claim its results.

### 5.2 Order of steps

1. **Back up** the target database (a Supabase point-in-time restore point or `pg_dump`).
2. **Apply migrations** to the target. From `apps/mercato`, with `DATABASE_URL` pointing at the target: `yarn db:migrate`. Check that `dealer_profiles`, `dealer_kyc_documents` and `dealer_capabilities` exist, and that `dealer_ledger_entries.created_by` is nullable.
3. **Sync role ACLs** so that tenants created before the Phase 2 modules existed get the `dealer:owner`/`dealer:staff` features from `dealer_org_rbac/setup.ts`, and so that any role ACL left by the old pre-P2-UI-02 approval code is repaired: `yarn mercato auth sync-role-acls --tenant <tenantId>`, or omit `--tenant` to do every tenant. Whether the deployed tenants need this was not checked. It is safe to re-run.
4. **Backend environment.** Add `APP_URL`, `DEALER_PORTAL_BASE_URL`, an email provider and a from-address (§3.1) to the ECS task definition. Do it through a reviewed change to `infra/ecs.tf` (plus SSM for the provider key), then `tofu plan`/`apply` and redeploy the service.
5. **Dealer portal.** Check the Vercel project's settings:
   - root `apps/dealer-portal`
   - install command `npm install && npm install --prefix ../../packages/ui --legacy-peer-deps` (per `CLAUDE.md`; `infra/vercel.tf` still says plain `npm install`, see §5.4)
   - build `npm run build`
   - `OM_API_BASE_URL=https://admin.giftory.dev.oxohive.com`

   Then redeploy.
6. **Smoke test** (§5.3).
7. Give the dealer registration link to the first dealers: `https://<portal-host>/onboarding/register?organizationId=<marketplace root org id>`. Registration is invite-link-only; there is no public sign-up link in the UI.

### 5.3 Smoke test (after deploying)

Real backend paths are module-prefixed (`/api/<module>/...`). Login is a form-encoded `POST /api/auth/login` and returns cookies.

1. `GET https://admin.giftory.dev.oxohive.com/api/healthz` returns 200. This is the same check the ECS container health check uses. Allow time for the scale-from-zero wakeup.
2. Log in to the admin panel and open `/backend/dealers/applications`. It should load without a 500. A 500 mentioning `dealer_profiles` means step 5.2(2) did not happen.
3. `GET https://<portal-host>/login` returns 200, and `GET https://<portal-host>/api/om/dealer_onboarding/dealer/onboarding/status` without cookies returns 401 from the backend. The second one proves the proxy can reach the backend.
4. Register a throwaway dealer through the registration link and confirm the invite email arrives. Note that it links to the **backend's** `/reset/<token>`, not the portal (§6). Set a password, log in to the portal, upload one KYC document, approve it in admin, and confirm the approval email arrives with a portal link.
5. Assign a real paid test order to that dealer. Confirm the dealer sees it in `/orders`, and that a commission snapshot and ledger credit appear in admin.
6. Write down the test dealer's ids so the data can be removed later. This document does not prescribe a removal method.

### 5.4 Infrastructure-as-code discrepancies a human must resolve before running `tofu apply`

- The `vercel_project.dealer_portal` resource in `infra/vercel.tf` was never applied or imported (commit `d85b082`, plus `CLAUDE.md`).
  - Its `dealer_portal_project_name` default is `giftory-dealer-portal`, but the real project is called `giftory`.
  - Its `install_command` is plain `npm install`, which `CLAUDE.md` says is not enough, because `packages/ui`'s own dependencies are never installed that way.

  Applying it unchanged could create a second, broken project instead of adopting the real one.
- `infra/ecs.tf` lacks the email and base-URL variables from §3.1.

### 5.5 Rollback

- **Backend code:** ECR images are tagged with the 7-character commit hash (`buildspec.yml`). Roll back by pointing the ECS service at the previous task-definition revision, or the previous image tag, and forcing a new deployment. Pushing to `main` triggers a deploy, so reverting a commit on `main` also works.
- **Dealer portal:** use Vercel's instant rollback (promote the previous production deployment).
- **Database:** the two dealer-table migrations have no `down()`. Rolling them back means dropping tables by hand, which loses any dealer data. Prefer rolling forward, or restoring the step-1 backup if nothing worth keeping has been written yet. The `payouts` migration's `down()` restores `NOT NULL` on `created_by`, which will fail if any system-created (null) rows exist.
- **Environment variables:** remove or restore them through the same reviewed Terraform change.

## 6. Known open issues at delivery (on `main`; not fixed by this document)

| # | Issue | Source | Effect |
|---|---|---|---|
| 1 | Phase 2 migrations have not been applied to real databases | §5.1 | Dealer onboarding is non-functional in real environments |
| 2 | Email variables are absent from `infra/ecs.tf` | §3.1 | Probably no dealer emails in production (not checked against live) |
| 3 | Owner and staff invite links point at the backend's `/reset/<token>`, not the portal's `/reset/[token]` | `apps/dealer-portal/src/app/(auth)/reset/[token]/page.tsx` header comment; P2-UI-04/07 handoffs. The fix lives in `@open-mercato/core` | Dealers set their first password on the admin-branded page, then have to go to the portal themselves |
| 4 | Known gaps 2–7 | `docs/dealer-marketplace-api.md` §Known gaps | `Idempotency-Key` not consumed; no payout balance guard; `adjustment_credit` excluded from `pendingAmount`; wrong KYC decryption scope; unvalidated `storageKey`; caller-chosen `organizationId` on register |
| 5 | No browser, accessibility or responsive test of any Phase 2 screen | VERIFICATION.md §4.4 | UI regressions would go unnoticed |
| 6 | Phase 1 regression suite not re-run; isolation across a second tenant never tested | VERIFICATION.md §4.7–4.8 | |
| 7 | FEAT-011 requirement 2 is only informational: the assignment UI shows every approved dealer and only hints at capabilities | P2-UI-13 handoff | The admin can assign to a dealer who isn't capable of the job |
| 8 | FEAT-013 requirement 5, a running balance per ledger entry, is not implemented: there is only an aggregate balance | P2-UI-03/14 handoffs | |
| 9 | `dealer_order.status_updated` is emitted but nothing consumes it. No notification worker exists (FEAT-010 requirement 6) | `grep` over `apps/mercato/src/modules` | |
| 10 | The admin dealer directory uses a single `dealer_org.admin` feature for both viewing and editing | P2-UI-12 handoff | No read-only admin role is possible |
| 11 | Some subscriber logs include `tenantId` (`notify-dealer-on-approval.ts`, `notify-dealer-on-rejection.ts`, `notify-dealer-on-assignment.ts`, `snapshot-on-assignment.ts`) | `grep` | Conflicts with `CLAUDE.md`'s "never expose tenantId in logs" |

A Milestone 1 hardening branch (`milestone-1-hardening`, not merged) has workstreams aimed at items 1 (runbook only), 4, 5 and 6. Check `tasks/milestone-1/PROGRESS.md` for their outcomes. This document does not claim them.

## 7. Actions only a human can take

1. Decide when to apply the three migrations to each real database, and do it (§5.2 steps 1–3).
2. Compare the live ECS task definition against §3.1, and add `APP_URL`, `DEALER_PORTAL_BASE_URL`, the email provider and the from-address through a reviewed Terraform change.
3. Confirm the live Vercel dealer-portal project's install command, root directory and `OM_API_BASE_URL`. Then fix `infra/vercel.tf` (project name, install command) and import the real project, or deliberately drop the resource.
4. Run the smoke test in §5.3 after 1–3.
5. Decide whether a non-zero commission rule and a real payment-gateway order should be part of an acceptance run before dealers are onboarded.

## 8. Running and testing locally (no secrets here; see the `.env.example` files)

| Step | Command | Notes |
|---|---|---|
| Backend install and run | `cd apps/mercato && yarn install && yarn dev:classic` (run `yarn generate` after changing discovery files) | Node ≥ 24, Yarn 4 via corepack. Copy `.env.example` to `.env` and fill it in. **The default `DATABASE_URL` in a teammate's `.env` may point at the shared Supabase dev database**, so check it before running `yarn db:migrate`. |
| Seed gift catalog | `yarn mercato gift_catalog seed-occasions --tenant <id> --org <id>` and `... seed-demo ...` | from `README.md` |
| Dealer portal install and run | `cd apps/dealer-portal && npm install && npm install --prefix ../../packages/ui --legacy-peer-deps && npm run dev` (port 3200) | Set `OM_API_BASE_URL=http://localhost:3000` in `apps/dealer-portal/.env.local`. This sequence (with `--no-package-lock` added) was run on 2026-11-23, followed by typecheck, lint, `npm test` (300/300) and `npm run build`, all successful. |
| Backend unit tests | `cd apps/mercato && yarn test` | |
| Dealer marketplace integration journey | `cd apps/mercato && yarn test:integration:ephemeral` | Needs Docker (Testcontainers starts a disposable Postgres). Builds and starts a production server, so allow several minutes. Uses its own disposable database (VERIFICATION.md §1). Not re-run on 2026-11-23. |
| Become a dealer locally | open `http://localhost:3200/onboarding/register?organizationId=<root org id>` | The invite email is only delivered if email is configured. Otherwise set `OM_TEST_MODE` plus the test email capture variables, as the integration harness does. |
