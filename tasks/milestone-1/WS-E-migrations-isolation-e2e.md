# WS-E — Migrations review, tenant isolation, local end-to-end runs

Branch `m1/ws-e` (from `milestone-1-hardening`). Overnight run 2026-11-23. Not pushed.

## Status

| Item | Status |
|---|---|
| 1. Review of the three migrations + runbook | **Done.** No defect in the migration SQL. Every runbook procedure rehearsed on throwaway local Postgres 17.5 databases. Nothing touched the shared dev DB. At the coordinator's request the runbook **also covers WS-A's two new idempotency-table migrations** (see below). |
| 2. Second-tenant isolation spec | **Written, typechecked, linted, discovered by the harness; provisioning step proven against a throwaway DB.** **Not yet run end to end**: that needs a running backend, and the sanctioned vehicle needs Docker. |
| 3. Local end-to-end + Phase 1 regression | **Not run.** Docker Desktop was down for the whole session, and the machine had too little free RAM (5 GB, shared with six other agents) for a production Next build of this app. Exact steps for you are below. |

Three findings need a decision (details under "Findings"):

1. **Four admin write routes accept a `dealerProfileId` from another tenant** and create orphan rows. Nothing leaks across tenants.
2. **The dev tenant may lack the `dealer:owner`/`dealer:staff` roles.** If so, dealer registration fails even after migrating.
3. **The `commissions` entity declares money columns as `integer`.** The next `yarn db:generate` will propose downgrading `numeric(18,0)` to `int`.

## What changed (files + why)

| File | Why |
|---|---|
| `tasks/milestone-1/RUNBOOK-migrations.md` (new) | Step-by-step for you to apply the three migrations to the shared dev DB. Covers read-only pre-checks (5 SQL queries + a read-only "what would `db:migrate` apply" script), backup, apply, the `relation already exists` baseline procedure, dealer-role fix, verification and rollback. |
| `apps/mercato/src/modules/dealer_orders/__integration__/dealer-isolation-cross-tenant.spec.ts` (new) | The second-tenant isolation spec: 10 serial tests, about 75 route checks. |
| `apps/mercato/src/modules/dealer_orders/__integration__/fixtures/isolation-env.ts` (new) | Spec helpers. **Safety guard**: refuses to run unless `DATABASE_URL` and `BASE_URL` point at a local host. Tenant provisioning goes through the real `mercato auth setup` / `auth add-user` CLI. Login, invite-completion and email-capture helpers. |
| `tasks/milestone-1/WS-E-migrations-isolation-e2e.md` (new) | This handoff. |

No migration file, module source file, `docs/**`, `README.md`, `CLAUDE.md` or `PROGRESS.md` was edited.

Commits on `m1/ws-e`:

- `804bf7f` test: cross-tenant and cross-dealer isolation spec for every Phase 2 route
- `a91e61a` docs: runbook for applying the three Phase 2 migrations to the dev DB
- `5084cac` test: assert A1's assignment status from JSON, not a substring
- `c978e5d` docs: cover WS-A's two idempotency-table migrations in the runbook
- (this file) docs: WS-E handoff

`m1/ws-e` branches from `milestone-1-hardening` **before** the WS-A merge. It touches only new
files, so it merges cleanly. The spec sends a valid `Idempotency-Key` (16–128 chars,
`[A-Za-z0-9-]`) on every assignment, payout, adjustment and rule POST, which satisfies WS-A's
new required-header checks.

## The isolation spec: what it covers

It provisions **two brand-new tenants (A, B)** with `mercato auth setup --json` plus a
tenant-scoped (non-superadmin) `admin` user each. It registers **dealers A1 + A2 (tenant A) and
B1 (tenant B)** through the real HTTP API, then takes each through invite → KYC upload →
approval → capabilities → staff → paid order assignment → commission snapshot → ledger credit.
It also creates a 10% commission rule per tenant, so the amounts are non-zero.

Assertions, each paired with a positive control (the owner *can* see the same thing):

- **Onboarding/KYC:** the other tenant's admin can't list, read, download KYC docs of, approve or
  reject an application. The application is still `under_review` afterwards. Dealers of the
  other tenant and of the same tenant can't download another dealer's KYC file. The status
  endpoint only ever shows the caller's own profile.
- **Dealer org:** the admin directory and dealer detail are tenant-scoped. A cross-tenant
  capabilities PUT is denied and the value is unchanged. A staff roster never shows another
  dealer's staff. Deactivating another dealer's staff (other tenant **and** same tenant) is
  denied, and the staff member can still log in afterwards.
- **Orders:** the admin current-assignment, history and per-dealer order list views reveal
  nothing cross-tenant. Assign/reassign/cancel on another tenant's order are rejected and the
  assignment is unchanged. For dealers in the other tenant and the same tenant: detail is
  denied, and list/dashboard/status transition reveal or change nothing.
- **Commissions:** rule list/read/deactivate are tenant-scoped and the rule is still active
  afterwards. Admin order/dealer commission views and dealer earnings list/detail are scoped,
  across tenants and across dealers.
- **Ledger/payouts:** the admin ledger of a foreign dealer is empty. The admin balance of a
  foreign dealer is 0, never the real balance. Every dealer ledger row belongs to the caller.
  A real own-tenant payout **does** move the balance, which proves the "unchanged" checks can
  detect a change.
- **INVARIANT test:** after tenant B's admin attempts writes that reference dealer A1, A1's
  balance, ledger count, own ledger, orders, earnings and rule list (tenant A's view) are
  unchanged. A1 also received **no email** about tenant B's order.
- **KNOWN DEFECT test** (`test.fail()`): asserts those foreign-dealer writes get a 4xx. Today it
  is *expected* to fail, so Playwright reports it as passed. Once all four routes are fixed it
  "unexpectedly passes", which flags that `test.fail()` should be removed.

Safety details (both verified):

- With `DATABASE_URL=postgresql://…@db.fakeproject.supabase.co…` the first test fails in 16 ms
  with `DATABASE_URL host "db.fakeproject.supabase.co" is not a local throwaway database`,
  before anything else runs.
- The CLI child process forces `SELF_SERVICE_ONBOARDING_ENABLED=false`. `setupInitialTenant`
  otherwise blanks the passwords of the seeded demo users (`superadmin@acme.com` etc.) when
  self-service onboarding is on, which the harness enables. That would break the 12-step
  journey spec and the Phase 1 suite running in the same environment.

## Commands run and exact results

All run in `C:\Users\danie\Gift-App-wt\ws-e\apps\mercato`. The throwaway database was a
private Postgres 17.5 cluster that I created under the session scratchpad (`initdb` +
`pg_ctl`, `127.0.0.1:55432` only, trust auth), using the local binaries at
`D:\Ejyle\pgsql\bin`. `DATABASE_URL` was always passed explicitly. The worktree's untracked
`apps/mercato/.env` is byte-identical to `.env.example` (`localhost:5432/open-mercato`
placeholder). It is **not** a copy of the real `.env`.

| Command | Result |
|---|---|
| `docker info` (start and later) | `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified` (daemon down) |
| `yarn generate` | OK (3.5 min); known non-fatal OpenAPI `ERR_IMPORT_ATTRIBUTE_MISSING` fallback warning |
| `yarn db:migrate` → fresh DB `mig_fresh` | exit 0. All modules applied, including `commissions 1`, `dealer_onboarding 1`, `dealer_orders 1`, `dealer_org_rbac 1`, `gift_catalog 1`, `payouts 2`, `storefront 2`. Non-fatal Windows-only `[query_index] … Cannot find package 'src'` warnings. |
| Tracking rows recorded | `Migration20261013232854_dealer_onboarding`, `Migration20261013232900_dealer_org_rbac`, `Migration20261012000000_payouts`, `Migration20261020123600_payouts` (full file stems; the `override name` property in the class is not what gets stored) |
| Entity-vs-schema diff (MikroORM `getUpdateSchemaSQL`, safe mode) on `mig_fresh` | `dealer_onboarding`: **no drift**. `dealer_org_rbac`: **no drift**. `payouts`: `created_at drop default` only (cosmetic). `dealer_orders`: `status set default 'assigned'` (cosmetic). `commissions`: `created_at`/`snapshotted_at drop default` and **`subtotal_amount`/`commission_amount type int`** (see Findings) |
| Scenario "dev-like" (`mig_devlike`: dealer tables + their tracking tables absent, payouts #2 unrecorded, `created_by NOT NULL`) → read-only lister | 3 pending: the two dealer migrations + `Migration20261020123600_payouts` |
| → `yarn db:migrate` | exit 0: `dealer_onboarding: 1 migration applied`, `dealer_org_rbac: 1 migration applied`, `payouts: 1 migration applied`. Re-run: all `no pending migrations`; lister `Total pending: 0` |
| Scenario C (`mig_scenario_c`: tables exist, dealer_onboarding tracking row deleted) → `yarn db:migrate` | exit 1: `💥 Failed: relation "dealer_kyc_documents" already exists`. The failed migration rolled back (tracking count 0), and `payouts` (alphabetically later) was not attempted. After inserting the tracking row → exit 0, `payouts: 1 migration applied`, `created_by` nullable. |
| Scenario C2 (tracking tables dropped entirely) → runbook §5 baseline SQL → lister → `db:migrate` | lister: only payouts pending; migrate exit 0; lister `Total pending: 0` |
| Rollback SQL (runbook §8) on a copy | OK; lister shows the two dealer migrations pending again |
| Pre-check Q1–Q5 on the simulated states | All return the expected rows. Q3 returns no rows when the tables are absent and all `ok` when present. |
| Dealer-role fix (runbook §7) on a copy with dealer roles deleted | `INSERT 6` roles, then `mercato auth sync-role-acls` → `dealer:owner` 8 features, `dealer:staff` 3 features in every tenant |
| `mercato auth setup --json` + `auth add-user` against a throwaway DB | 36 s; JSON with tenantId/organizationId; new tenant has `admin`/`dealer:owner`/`dealer:staff` with all Phase 2 features |
| Isolation spec, test 1 only, `DATABASE_URL`=throwaway DB, `BASE_URL`=closed port | Both tenants provisioned through the spec's own helper (each with 2 users + 2 dealer roles), then failed at HTTP login with `ECONNREFUSED`, as expected with no server |
| Isolation spec, test 1, `DATABASE_URL`=fake Supabase host | Refused by the guard (see above) |
| `tsc -p <tsconfig scoped to the 3 spec/fixture files + journey spec>` | exit 0 |
| `eslint src/modules/dealer_orders/__integration__/` | exit 0, no warnings |
| `playwright test --config .ai/qa/tests/playwright.config.ts --list` | `Total: 22 tests in 2 files` (10 isolation + 12 journey) |
| `jest --listTests` | 64 files, none under `__integration__` (jest still ignores them) |

**WS-A migrations** (`payouts/Migration20261123120000_payouts`,
`dealer_orders/Migration20261123174400_dealer_orders`) were rehearsed from an export of
`milestone-1-hardening@dfa2b5c` (`git archive` into the scratchpad, `node_modules` junctioned;
nothing in the main checkout touched):

| Command | Result |
|---|---|
| Lister on a dev-like DB (state A) | 5 pending: the three Phase 2 migrations + `Migration20261123174400_dealer_orders` + `Migration20261123120000_payouts` |
| `yarn db:migrate` | exit 0: `dealer_onboarding 1`, `dealer_orders 1`, `dealer_org_rbac 1`, `payouts 2`; lister `Total pending: 0`; both `*_scope_key_uniq` constraints present |
| Entity diff against the branch's entities | `payouts_idempotency_keys`: only the cosmetic `created_at` default; `dealer_order_idempotency_keys`: no drift; `dealer_orders` keeps the known pre-existing `status` default drift; `dealer_onboarding`/`dealer_org_rbac`: no drift |
| Two-phase path (DB already migrated from pre-WS-A code) | lister: exactly the 2 WS-A migrations pending; `db:migrate` exit 0 (`dealer_orders 1`, `payouts 1`); then 0 pending |
| WS-A rollback SQL (runbook §8) on a copy | OK; the two migrations show as pending again |

Runbook changes for WS-A: apply order and timing (before or together with merging
`milestone-1-hardening` to `main`, because the push auto-deploys and the new routes need the
tables); Q1 includes the two tables (must not pre-exist); expected lister and migrate output
for both the `main` and the `milestone-1-hardening` runs; a verification query for the unique
constraints; rollback; and a mandatory `yarn generate` after merging (new entities).

The full `yarn typecheck`/`yarn lint`/`yarn build` were not run. No app source changed, so the
results would only repeat the baseline. `yarn typecheck` also needs 8 GB of heap, which the
machine didn't have.

## Decisions made and reasoning

- **No migration file edited, and no follow-up migration added.** The SQL matches the entities
  exactly. The non-idempotence (`CREATE TABLE` without `IF NOT EXISTS`) is normal for
  MikroORM-generated migrations, and the runbook handles it with a verified baseline procedure.
  That is safer than a new migration that would itself need ordering guarantees.
- **The isolation spec lives next to the journey spec in `dealer_orders/__integration__/`**, so
  it reuses `fixtures/pg.ts` (synthetic paid orders) and the harness discovers it. That
  location is proven to be scanned.
- **Tenants are created with the real CLI**, not raw SQL or the superadmin API. `auth setup`
  runs every module's `onTenantCreated` hook and ACL defaults, so the test exercises the real
  provisioning path. Tenant admins are plain `admin` role users, not superadmins, so the checks
  test tenant scoping rather than a superadmin bypass.
- **The isolation spec creates its own two tenants** instead of reusing the seeded one. That
  makes it independent of the journey spec's data and run order.
- **Foreign-dealer writes are isolated into `test.fail()`**, while the cross-tenant invariant is
  a hard assertion. WS-A's payout balance guard may change some of those statuses after
  merge. This split keeps the suite stable either way while still failing loudly on any real
  leak.
- **No full-stack run without Docker.** The harness hard-requires Docker
  (`assertContainerRuntimeAvailable`). Re-creating it by hand on my local Postgres would have
  needed a production Next build. CodeBuild was OOM-killed at 7 GB building this app, and this
  machine had about 5 GB free shared with six other agents. Dev mode also needs the worker
  supervisor for invite emails, and it differs from the production build that previously hid
  real bugs. Not worth the risk to the other workstreams or the reliability of the result.

## Findings

### F1: migration review (all three migrations)

- `dealer_onboarding` (`dealer_profiles`, `dealer_kyc_documents`) and `dealer_org_rbac`
  (`dealer_capabilities`): columns, types, nullability, defaults and index names match the
  entities exactly. There are no money columns. Every table has `tenant_id`, and soft delete
  uses `deleted_at`. There are no FKs, by design (module isolation).
- `payouts` follow-up `ALTER COLUMN created_by DROP NOT NULL`: correct, idempotent, brief lock.
  Its `down()` would fail once any null row exists. The runbook says never roll it back.
- Neither `CREATE TABLE` migration has a `down()`. Rollback is the manual SQL in the runbook.
- Improvements worth a **future** migration, deliberately not added:
  - `dealer_capabilities` is "one row per dealer" (upsert) but has no unique index on
    `dealer_profile_id`, so concurrent upserts could create duplicates. Suggested:
    `create unique index dealer_cap_profile_uniq on dealer_capabilities (dealer_profile_id) where deleted_at is null;`
    together with an `@Unique`/index on the entity. Check for duplicates first.
  - `dealer_profiles` has no unique index on `organization_id` (one dealer per org) and
    `contact_email` uniqueness per tenant is app-enforced only.

### F2: the deploy pipeline never runs migrations

The ECS image's `CMD` is `yarn start` (`mercato server start`), which has no migrate step.
`docker/scripts/init-or-migrate.sh` (migrate + `auth sync-role-acls`) is only used by
docker-compose. So every migration on `main` stays unapplied on dev until someone runs it by
hand. That includes these three; the dealer flows and commission ledger credits on the deployed
backend are broken until then. Consider a one-off ECS task or a CodeBuild step, plus the
pending-migrations lister as a deploy gate (runbook §9).

### F3: dealer roles may be missing on the dev tenant

`dealer:owner`/`dealer:staff` are created only by `onTenantCreated` or `mercato init`'s
`seedDefaults`. `sync-role-acls` only grants features to roles that already exist. If the dev
tenant predates these modules, registration can't assign the owner role. Runbook Q5 checks
this and §7 fixes it (rehearsed).

### F4: admin writes accept a foreign-tenant `dealerProfileId` (needs a fix; owner: module authors)

There is no check that the dealer belongs to the caller's tenant (or is approved) in:

- `dealer_orders` assign/reassign (`commands/assignments.ts` still carries the note "dealer
  approval check … should be added here once FEAT-008 is complete"),
- `commissions` rule create (`commands/rules.ts`),
- `payouts` record-payout and create-adjustment (`commands/entries.ts`).

Effect: orphan rows under the caller's tenant pointing at another tenant's dealer id (for an
assignment, also a commission snapshot and ledger credit). **No data crosses tenants**: every
read filters by the caller's `tenant_id`, and the notification subscriber is tenant-scoped. The
INVARIANT test asserts exactly this. Fix: in each command, load
`DealerProfile { id, tenantId: scope.tenantId, deletedAt: null }` (plus
`kycStatus: 'approved'` for assignment) and return 404 if missing. Then remove `test.fail()`
from the last test. A related, same-tenant issue: assigning to a pending or rejected dealer is
also accepted.

### F5: commissions entity/table money type mismatch

`commissions/data/entities.ts` declares `subtotal_amount`/`commission_amount` as `integer`. The
migration (correctly) created `numeric(18,0)`. `yarn db:generate` will keep proposing
`ALTER … TYPE int`. That would cap at about ₹2.1 crore in paise and break the money
convention. Fix the entity (`type: 'numeric', precision: 18, scale: 0`, string-typed like
`payouts`), and meanwhile never accept that hunk. Owned by the commissions/money workstream,
not changed here.

### F6: minor inconsistency

`GET /api/payouts/admin/dealers/:id/ledger/balance` returns `200 {pendingAmount: 0, …}` for a
dealer id that isn't in the caller's tenant, where other routes return 404. Nothing leaks. The
spec accepts 403/404, or 200 with zeros.

## Not done and why

- **No end-to-end run** of the 12-step journey spec, the new isolation spec, or the Phase 1
  regression suite. Docker was down all session (the harness requires it), and RAM was too
  tight for a production build (see Decisions).
- **No full `yarn typecheck`.** It needs 8 GB of heap, and no app code changed. A scoped `tsc`
  on the new files is clean.
- **No unique-index follow-up migration (F1).** It needs an entity change outside my scope and
  a duplicate check on dev first.

## Actions the human must take

1. **Apply the migrations** with `tasks/milestone-1/RUNBOOK-migrations.md`. Recommended: one
   run from an up-to-date `milestone-1-hardening` checkout (`yarn install && yarn generate`
   first), **immediately before merging it to `main`**. Expect five pending: the three Phase 2
   migrations plus WS-A's two. The WS-A payout/adjustment/assignment routes fail until their
   tables exist, and the merge auto-deploys. Run the read-only pre-checks first, then back up,
   apply and verify.
2. **Run the Phase 2 integration specs (needs Docker Desktop running):**
   ```bash
   cd apps/mercato
   yarn install                      # if node_modules is stale
   yarn test:integration:ephemeral src/modules/dealer_orders/__integration__
   ```
   This boots a disposable `pgvector/pgvector:pg16` container and a production build on
   `127.0.0.1:5001`. It overrides `DATABASE_URL` for the app, the CLI and Playwright, so your
   real `.env` is not used for data. The isolation spec also refuses any non-local DB. Expect
   **22 passed**: journey 12/12, and isolation 10/10, where the last test is an expected failure
   that Playwright counts as passed. Takes about 10–15 min the first time (build), about 4–5 min
   for the isolation spec. HTML report: `apps/mercato/.ai/qa/test-results/html`. If a test
   fails, the list output names the exact route and the leaked identifier (e.g.
   `tenant B admin: read A1 application: expected 403/404, got 200`).
3. **Run the Phase 1 regression suite** (`apps/storefront/__integration__/storefront-and-admin.spec.ts`).
   The ephemeral harness only discovers specs inside `apps/mercato`, so this needs the backend
   kept alive:
   1. Terminal 1: `cd apps/mercato && yarn test:integration:ephemeral:start` and wait for
      `[ephemeral] Ready for QA exploration at http://127.0.0.1:5001`.
   2. Terminal 2 (`apps/mercato`). Read `databaseUrl` from `apps/mercato/.ai/qa/ephemeral-env.json`.
      **Every command below must carry it inline.** Your real `.env` points at Supabase, and a
      missing `DATABASE_URL` would seed the shared dev DB.
      ```bash
      export EPH_DB='postgres://mercato:secret@localhost:<port>/mercato_test'   # from ephemeral-env.json
      DATABASE_URL="$EPH_DB" TENANT_DATA_ENCRYPTION_FALLBACK_KEY=om-ephemeral-integration-fallback-key yarn mercato auth list-orgs
      #   -> must show only the seeded demo org(s); copy tenantId + organizationId
      DATABASE_URL="$EPH_DB" TENANT_DATA_ENCRYPTION_FALLBACK_KEY=om-ephemeral-integration-fallback-key yarn mercato gift_catalog seed-occasions --tenant <tenantId> --org <orgId>
      DATABASE_URL="$EPH_DB" TENANT_DATA_ENCRYPTION_FALLBACK_KEY=om-ephemeral-integration-fallback-key yarn mercato gift_catalog seed-demo --tenant <tenantId> --org <orgId>
      ```
   3. Terminal 3: storefront against the ephemeral backend:
      ```bash
      cd apps/storefront
      NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:5001 NEXT_PUBLIC_SITE_URL=http://localhost:3100 \
      MERCATO_TENANT_ID=<tenantId> MERCATO_ORGANIZATION_ID=<orgId> npm run dev
      ```
   4. Terminal 4: `cd apps/storefront && npx playwright install chromium` (once), then
      `BASE_URL=http://localhost:3100 ADMIN_URL=http://127.0.0.1:5001 npx playwright test`.
      Payment checks only exercise the "no payment keys" fallback. No live Stripe/Razorpay
      capture happens, and none should be claimed.
4. **Decide on F4** (add tenant/approval checks to the four write commands) and **F5** (fix the
   commissions entity type). Both are small, but outside WS-E's scope.

## Risks

- **The isolation spec has never run against a live backend.** It was written from a careful
  reading of every route and command, and its provisioning step is proven, but some response
  shapes are inferred from source. Most likely failure modes are a status-code assumption
  (e.g. a 400 where I accept 403/404) or invite-email timing (20 s poll). Those would be test
  bugs, not leaks. Each assertion message names the route, so they're quick to adjust.
- **Merge interplay.** WS-A (payout guard, idempotency) and WS-B (register `organizationId`
  trust) touch routes this spec calls. The spec already sends `Idempotency-Key` on every
  money/assignment POST and registers dealers with the documented
  `{ organizationId: <tenant root org>, … }` body. If WS-B changes the registration contract,
  the "registers dealers" test needs the same change as the journey spec.
- **The dev DB state is inferred**, not observed. The runbook's read-only pre-checks decide the
  path. Do not skip them.
- **`test.fail()` semantics.** If someone fixes F4 partially, the known-defect test still
  "passes" (at least one write is still accepted). It only flags once all four are fixed. That
  is intentional.

## Local cleanup

The throwaway Postgres cluster under the session scratchpad
(`…\scratchpad\pg\data`, port 55432) was stopped at the end of the session. It and the
`mig_*` scratch databases contain only synthetic data. The worktree's `apps/mercato/node_modules`
is a junction to the main checkout (never committed), and `apps/mercato/.mercato/` holds
generated output (gitignored).
