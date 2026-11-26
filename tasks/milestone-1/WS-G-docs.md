# WS-G — Delivery docs and status cleanup

Branch `m1/ws-g` (worktree `C:\Users\danie\Gift-App-wt\ws-g`), based on `milestone-1-hardening` (`216017b`). Run on 2026-11-23, overnight and unattended. Documentation only: no code, infrastructure, database or deployed app was touched, and nothing was pushed.

## Status

**Done**, with the open human actions listed at the end.
- Every Phase 2 status document now matches the git history, the code on `main` (`5bb2a3c`) and the recorded test evidence.
- P2-UI-18's documentation is written ([tasks/phase-2-ui/DELIVERY.md](../phase-2-ui/DELIVERY.md)).
- P2-UI-18 itself stays **In progress**. Its remaining items (apply migrations, fix production env vars and the Vercel/Terraform mismatch, run the smoke test) need a human with access to the real environments.

The one distinction to read everything through: the "12/12 live" result from 2026-10-20 means **real HTTP and real Postgres in a disposable local environment** (`yarn test:integration:ephemeral`). It is API-level only. It does not mean the deployed environment, and it does not mean a browser. Every doc now says so.

## What changed (files and why)

| Commit | Files | Why |
|---|---|---|
| `f1e7477` | `tasks/phase-2-ui/README.md`, `TASK-00`…`TASK-18` (status lines only, plus one "status review" line in each handoff) | TASK-01/06/08/13/18 headers still said "Planned; implementation not started" although 01–16 were merged in PR #2. Several handoff statuses contradicted their headers. Each header now has a checked status with commit hashes and exactly what the 12/12 run exercised. The README index gains Commits and Evidence columns and a dated "what is still open" section. |
| `159e4b8` | `tasks/phase-2-ui/DELIVERY.md` (new), `TASK-18` checklist and handoff | P2-UI-18's documentation work. DELIVERY.md contains: implemented vs tested vs deployed; hosts and the cookie/BFF flow; exact env var names compared against `infra/ecs.tf`; a dependency-ordered deployment plan; smoke test; rollback; open issues; human actions; local run/test steps. |
| `98ae853` | `docs/phase-2-status.md` (rewritten) | It said the portal was "scaffold only", the UI was "Planned" and live verification was "not executed". It now describes the real state, with a numbered list of what is still open. The `milestone-1-hardening` branch is mentioned neutrally, with none of its results claimed. |
| `3fbbfbc` | `docs/phase-2-testing-guide.md` | No boxes ticked, because nobody has run it against the dev environment it targets. 37 items are annotated `[auto: covered]` or `[auto: partial — …]` according to what the journey spec actually asserted, and 4 more `[expected to fail on main]` (known gaps 2 and 4). A header lists the guide's errors against current code. |
| `8a6adf2` | status/README/DELIVERY/TASK-00 | Known gap 6 (`storageKey` trusted verbatim) looks already fixed in code: the upload has been multipart since P2-UI-03 and stores the server-generated attachment id (`dealer_onboarding/commands/documents.ts`). The docs now list gaps 2–5 and 7 as open. |
| `51f0ef9` | `spec/phase-2/features/FEAT-008…013` (status lines), `spec/phase-2/stories/US-005`, `spec/phase-2/index.md` | FEAT-009–013 go from Draft to Implemented, with the requirements that are only partly met named. US-005 goes from Proposed to **"Implemented, not yet Done"**, with a per-AC verification table. The index goes from Planning to Implemented. |
| `4ee441d` | `README.md`, `CLAUDE.md` | README: the portal is not a "scaffold"; the missing `packages/ui` install step is added; "deployed" now carries the caveat that migrations are unapplied; the broken `docs/features/` link is fixed (specs are in `spec/`). CLAUDE.md: the portal goes through a BFF proxy, not "directly". |
| (this file) | `tasks/milestone-1/WS-G-docs.md` | Handoff |

## Verification performed

- `git log --all --grep=P2-UI-NN` for every task, and checked that each task's code exists. All 18 portal pages are under `apps/dealer-portal/src/app`. The admin pages are under `dealer_onboarding/backend`, `dealer_org_rbac/backend`, `commissions/backend` and `payouts/backend`, and the injected tab is `dealer_orders/widgets/injection/order-assignment-tab`.
- Read `apps/mercato/src/modules/dealer_orders/__integration__/dealer-marketplace-journey.spec.ts` line by line, so that the claimed coverage matches what is actually asserted.
- In this worktree, `apps/dealer-portal`:
  - `npm install --no-package-lock`
  - `npm install --prefix ../../packages/ui --legacy-peer-deps --no-package-lock`
  - `npm run typecheck`: clean
  - `npm run lint`: 0 errors, 2 known warnings
  - `npm test`: **300/300**
  - `npm run build`: **succeeded** (18 pages + 3 route handlers)

  `node_modules` and `.next` are gitignored, and the worktree is clean.
- Read the deploy path: the `apps/mercato/Dockerfile` runner `CMD` is `yarn start`, i.e. `mercato server start`. The production branch in `@open-mercato/cli/dist/mercato.js` spawns only `next start` and the workers. `buildspec.yml` has no migration step. Conclusion: **deploys never run migrations.**
- Read `infra/ecs.tf`, `infra/vercel.tf`, `infra/variables.tf`, `apps/mercato/.env.example`, `@open-mercato/shared/dist/lib/email/config.js`, `@open-mercato/core/dist/modules/auth/api/login.js` (cookie attributes) and `auth/cli.js` (`sync-role-acls` arguments). These were read from `C:\Users\danie\Gift-App\apps\mercato\node_modules` (read-only; that checkout was not modified).
- Confirmed in code: known gaps 2, 3, 4, 5 and 7 are still present; gap 6 looks fixed. The ledger balance SQL counts only `commission_earned` credits.
- **Not run:** `apps/mercato` Jest or the integration journey. The coordinator's 2026-11-23 numbers and the 2026-10-20 VERIFICATION.md results are quoted and attributed as such.

## Discrepancies found

Fixed in this branch:
1. TASK-01/06/08/13/18 headers said "Planned; implementation not started" despite merged commits `99d79f8`, `9dc442f`, `f8e1d8a`, `7609228`. The TASK-06/12/13/15/16 handoff statuses disagreed with their headers.
2. `docs/phase-2-status.md` was stale: "scaffold only", UI "Planned", "Every task is still at status Planned", live verification "not executed", and dealer isolation listed as the biggest open gap although it was fixed in P2-UI-02.
3. `spec/phase-2/index.md` listed FEAT-008 as Draft while FEAT-008's own file said Implemented. The phase status was "Planning". The index also called `packages/api-client` "generated", but it is hand-written.
4. `README.md` linked to `docs/features/`, which does not exist. It called the portal a "scaffold", and its portal run steps lacked the `packages/ui` install.
5. `CLAUDE.md` said the portal calls the backend "directly"; it goes through a server-side BFF proxy.
6. `docs/phase-2-testing-guide.md` was wrong against current code in five ways: unprefixed paths (real ones are `/api/<module>/…`), Bearer auth (the code uses cookie login), a JSON `storageKey` upload (the route is multipart-only), `?dealerProfileId=` (now session-derived), and `/api/health` (the real route is `/api/healthz`). These are noted in its header. The request examples were not rewritten.

**Not fixed (outside WS-G's file scope), for the human or the owning workstream:**

7. `docs/dealer-marketplace-api.md` known gap 6 (`storageKey`) looks already resolved in code but is still listed as open. WS-B owns this area tonight.
8. The doc comment in `apps/mercato/src/modules/payouts/components/money.ts` (around line 76) says an `adjustment_credit` "increases `pendingAmount`". Neither that function nor the server SQL does so: both count only `commission_earned` credits, which is known gap 4. The comment is wrong. Relevant to WS-A.
9. `infra/ecs.tf` sets no `APP_URL`, `DEALER_PORTAL_BASE_URL`, email provider or from-address. `DEALER_PORTAL_BASE_URL` is in no `.env.example` at all. In production, `resolveDealerPortalBaseUrl()` throws when it is unset, and without a from-address the email layer sends nothing. **If the live task definition matches Terraform, deployed dealers cannot receive their invite and so cannot set a password.** This was not checked against the live environment.
10. `infra/vercel.tf` `vercel_project.dealer_portal`: the default name is `giftory-dealer-portal` but the real project is `giftory`, and `install_command = "npm install"` lacks the `packages/ui` install that `CLAUDE.md` says is required. Applying it unchanged would probably create a second, broken project.
11. Some subscriber log calls include `tenantId` (`notify-dealer-on-approval.ts`, `notify-dealer-on-rejection.ts`, `notify-dealer-on-assignment.ts`, `commissions/subscribers/snapshot-on-assignment.ts`). `CLAUDE.md` says never to log `tenantId`.
12. ADR-001 (region) and ADR-002 (payout provider) are still `Proposed`, although `spec/phase-2/index.md` said they must be resolved before implementation, and the implementation already assumes India/INR and a manual ledger. ADR files are outside WS-G's scope.
13. `tasks/phase-2-ui/VERIFICATION.md`'s body (§1–§9) still records first-checkpoint facts that its own top "Update" supersedes: "spec not executed", "`ds:check` fails", "typecheck 177" vs 147. It is a historical record by design and was left alone.
14. `spec/phase-1/stories/US-001` is marked Done, while `spec/phase-1/index.md` "Known Gaps" says the products-page occasion chip selector is not fully implemented. AC 2 is written conditionally ("when … a selector is present"), so this is ambiguous rather than clearly wrong. **Not changed.** The other Phase 1 statuses (US-002 In Progress, US-003 Done, US-004 Done with env caveat) are consistent with the repo.

## Not done, and why

- **No deployed-environment checks.** HTTP calls to deployed apps, AWS, Vercel and the database were out of bounds. So `giftory-blue.vercel.app` being live, the live ECS env vars and the real DB migration state are all reported as unverified, quoting the last recorded evidence with its date.
- **No re-run of the integration journey or `apps/mercato` Jest.** That needs Docker and several minutes per run, and WS-E/WS-D own those runs tonight.
- **US-005 not marked Done.** Its ACs 2 and 4 include email delivery, which was never observed, and AC 3's admin route was not exercised live. Its dependency US-002 is still In Progress, and production migrations are unapplied.
- **The feature specs' API Contract tables (`spec/phase-2/features/*`) were not rewritten.** They still show unprefixed paths. Only the status lines were updated. The authoritative reference is `docs/dealer-marketplace-api.md`.
- **The testing guide's request examples were not rewritten.** The corrections are listed in its header instead, to keep the user's original document intact.
- **The P2-UI-18 acceptance item "add focused tests" was not done.** This pass changed only documentation, so there was no behavior to test.

## Actions the human must take

All of these are also in [DELIVERY.md §7](../phase-2-ui/DELIVERY.md#7-actions-only-a-human-can-take).
1. **Apply the three Phase 2 migrations** (`dealer_onboarding`, `dealer_org_rbac`, `payouts` `Migration20261020123600`) to each real database, after a backup. Then run `yarn mercato auth sync-role-acls`. Use WS-E's runbook if it exists. Note that the two dealer-table migrations have no `down()`.
2. **Check the live ECS task definition** for `APP_URL`, `DEALER_PORTAL_BASE_URL`, `SYSTEM_EMAIL_PROVIDER` (+ key) and `NOTIFICATIONS_EMAIL_FROM`/`EMAIL_FROM`/`ADMIN_EMAIL`. Add any that are missing through a reviewed `infra/ecs.tf` change, and add `DEALER_PORTAL_BASE_URL` to `apps/mercato/.env.example`.
3. **Reconcile `infra/vercel.tf` with the real Vercel project `giftory`** (name and install command), then import it, or drop the resource.
4. **Run the smoke test** in DELIVERY.md §5.3 after 1–3.
5. **Decide on ADR-001/ADR-002** and mark them Accepted, or revisit.
6. **Small doc and code follow-ups owned elsewhere:**
   - remove gap 6 from `docs/dealer-marketplace-api.md` if WS-B confirms it
   - fix the `payouts/components/money.ts` comment
   - decide whether `tenantId` should be dropped from the subscriber logs
7. **Merge order:** this branch touches only docs/spec/task files, which nothing else in the run should touch. The one exception is that `tasks/phase-2-ui/README.md` and `docs/phase-2-status.md` describe the open items **as of `main`**. If other workstreams' fixes are merged first, update the "Still open" lists in those two files and DELIVERY.md §6 to match.
