# P2-UI-02: Dealer authorization and data isolation prerequisite

- Status: Review
- Owner lane: A
- Depends on: P2-UI-00
- Owned paths: Backend non-UI code in dealer_orders/, commissions/, payouts/ and dealer_org_rbac/ authorization/setup; scoped security tests

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [x] Derive dealer identity from authenticated tenant and organization for every orders, earnings, ledger, balance, detail and status endpoint.
- [x] Reject unauthorized caller-supplied dealer IDs; enforce ownership in reads and mutations; fail closed on missing scope and unapproved/inactive dealer.
- [x] Reconcile dealer owner/staff feature grants, new setup and existing-account update procedure without automatically migrating or reseeding live accounts.
- [x] Use framework capability checks; preserve admin scope, public contracts and existing behavior unless a documented correction is required.

## Acceptance and verification

- [x] Two dealers in the same tenant cannot read or mutate one another's records, including guessed IDs and changed query strings.
- [x] Cross-tenant, anonymous, inactive and pending dealer checks pass at route level.
- [x] Owner/staff capability matrix passes; existing admin and unit tests remain valid.
- [x] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [x] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Review

- **Scope note:** this task's priority was revised mid-flight (see README.md's background section and `API-CONTRACTS.md`/`CONTRACT-HANDOFF.md` from P2-UI-00) to fix three issues in this order: (1) a NEW, severe ACL replace-vs-merge data-corruption bug in the already-merged dealer approval flow, (2) NEW missing `*.dealer_access` grants that made every dealer-facing route in `dealer_orders`/`commissions`/`payouts` unreachable by any dealer, and (3) the originally-scoped caller-supplied-`dealerProfileId` trust gap. All three are fixed below, in that order.

### Fix 1 — ACL replace-vs-merge data corruption (most severe, new)

`dealer_onboarding/commands/review.ts`'s `scopeDealerRoleToOrg` called the core `auth.role-acl.update` command with a hardcoded two-feature list on every dealer approval. That core command's `persist` (`node_modules/@open-mercato/core/dist/modules/auth/commands/acl.js`) does `acl.featuresJson = input.features` / `acl.organizationsJson = input.organizations` — a straight **replace**, not a merge. Since `dealer:owner` is one shared `RoleAcl` row per tenant (ADR-003), approving any dealer wiped `dealer_org.*` grants for every already-approved dealer owner in the tenant and dropped `organizationsJson` coverage for every still-pending dealer (locking them out of even `GET .../onboarding/status`).

**Fix:** `scopeDealerRoleToOrg` now reads the role's *current* `featuresJson`/`organizationsJson` first and only ever unions into them — it never sends a value that could drop something already granted. It only calls `auth.role-acl.update` when the org isn't yet scoped in **or** a required feature is missing (so it also self-heals a tenant whose RoleAcl was already corrupted by the pre-fix code, the next time any dealer in that tenant is approved).

**Verified no other caller has the same bug:** `grep -rn "role-acl.update" --include="*.ts" src/` returns exactly one application call site (`dealer_onboarding/commands/review.ts`); everything else is the core SDK's own command definition.

Changed: `apps/mercato/src/modules/dealer_onboarding/commands/review.ts`, `apps/mercato/src/modules/dealer_onboarding/lib/constants.ts` (added `DEALER_OWNER_APPROVAL_FEATURES`).

### Fix 2 — missing `*.dealer_access` grants (new)

Confirmed by grep: `dealer_orders.dealer_access`, `commissions.dealer_access`, `payouts.dealer_access` were declared in each module's `acl.ts` and required by every dealer-facing route, but granted nowhere.

**Fix, two complementary parts, both merge-safe:**
1. `dealer_orders/setup.ts`, `commissions/setup.ts`, `payouts/setup.ts` now declare `defaultRoleFeatures` for `dealer:owner`/`dealer:staff` (`dealer_orders.dealer_access` → both owner and staff per FEAT-009; `commissions.dealer_access`/`payouts.dealer_access` → owner only — staff has no financial access by design). These are applied via the core SDK's own merge-safe `ensureRoleAclFor` at tenant creation, and via `yarn mercato auth sync-role-acls` for already-provisioned tenants (see Blockers below — this is a human-run step, not something this change runs automatically).
2. The same three features are folded into Fix 1's `DEALER_OWNER_APPROVAL_FEATURES` union, so the dealer:owner role's ACL also picks them up (merge-safe) on the very next dealer approval in any tenant, without waiting for `sync-role-acls`.

Changed (beyond Fix 1's files): `apps/mercato/src/modules/dealer_orders/setup.ts`, `.../lib/constants.ts`; `apps/mercato/src/modules/commissions/setup.ts`, `.../lib/constants.ts`; `apps/mercato/src/modules/payouts/setup.ts`, `.../lib/constants.ts`.

### Fix 3 — caller-supplied `dealerProfileId` trust gap (originally scoped)

Added `resolveOwnDealerProfileId(em, organizationId, tenantId)` to each of `dealer_orders/commands/shared.ts`, `commissions/commands/shared.ts`, `payouts/commands/shared.ts` (mirroring the existing `findOwnProfile` precedent in `dealer_org_rbac/commands/shared.ts`): it looks up the caller's own `DealerProfile` by session-derived `organizationId`+`tenantId`, requires `kycStatus: 'approved'`, and throws `notFound` (404) otherwise — failing closed for cross-tenant, pending, rejected and inactive dealers alike (anonymous callers never reach this code; `requireFeatures` blocks them earlier).

Applied it to replace every caller-supplied/optional `dealerProfileId` with the session-derived value:
- `dealer_orders/api/dealer/orders/route.ts` (list) and `.../[id]/route.ts` (detail) — detail route now also filters by `dealerProfileId`, not tenant alone.
- `dealer_orders/commands/assignments.ts`'s `updateStatusCommand` (status mutation) — now filters **both** the lookup and the `updateOrmEntity` write by the session-derived `dealerProfileId`, not tenant alone. Extracted as an exported `executeUpdateStatus` function (mirroring `review.ts`'s `executeApprove`/`executeReject` pattern) so this is unit-testable without the full command bus.
- `commissions/api/dealer/earnings/route.ts` (list) and `.../[assignmentId]/route.ts` (detail).
- `payouts/api/dealer/ledger/route.ts` (list) and `.../ledger/balance/route.ts` — this route previously *required* a caller-supplied `dealerProfileId` query param and never checked it against the session; it is now derived from session only and the query param is gone entirely.

A caller-supplied `dealerProfileId` query param is now silently ignored everywhere it used to be read (never used to decide what is returned); the admin-side routes/schemas that legitimately take a dealer id from a path param (`/admin/dealers/{dealerId}/...`) were not touched.

### Changed files (full list)

```
apps/mercato/src/modules/dealer_onboarding/commands/review.ts
apps/mercato/src/modules/dealer_onboarding/lib/constants.ts
apps/mercato/src/modules/dealer_onboarding/__tests__/review.commands.test.ts
apps/mercato/src/modules/dealer_orders/setup.ts
apps/mercato/src/modules/dealer_orders/lib/constants.ts
apps/mercato/src/modules/dealer_orders/commands/shared.ts
apps/mercato/src/modules/dealer_orders/commands/assignments.ts
apps/mercato/src/modules/dealer_orders/api/dealer/orders/route.ts
apps/mercato/src/modules/dealer_orders/api/dealer/orders/[id]/route.ts
apps/mercato/src/modules/dealer_orders/__tests__/contracts.test.ts            (added)
apps/mercato/src/modules/dealer_orders/__tests__/dealerScope.test.ts          (new)
apps/mercato/src/modules/dealer_orders/__tests__/assignments.commands.test.ts (new)
apps/mercato/src/modules/commissions/setup.ts
apps/mercato/src/modules/commissions/lib/constants.ts
apps/mercato/src/modules/commissions/commands/shared.ts
apps/mercato/src/modules/commissions/api/dealer/earnings/route.ts
apps/mercato/src/modules/commissions/api/dealer/earnings/[assignmentId]/route.ts
apps/mercato/src/modules/commissions/__tests__/contracts.test.ts              (added)
apps/mercato/src/modules/commissions/__tests__/dealerScope.test.ts            (new)
apps/mercato/src/modules/payouts/setup.ts
apps/mercato/src/modules/payouts/lib/constants.ts
apps/mercato/src/modules/payouts/commands/shared.ts
apps/mercato/src/modules/payouts/api/dealer/ledger/route.ts
apps/mercato/src/modules/payouts/api/dealer/ledger/balance/route.ts
apps/mercato/src/modules/payouts/__tests__/contracts.test.ts                  (added)
apps/mercato/src/modules/payouts/__tests__/dealerScope.test.ts                (new)
```

No `dealer_org_rbac` files were changed — that module's own `findOwnProfile`/org-scoping was already correct (it already required `kycStatus: 'approved'` and never trusted a caller-supplied id); it was read for precedent only.

- Verified contracts: `tasks/phase-2-ui/API-CONTRACTS.md` and `CONTRACT-HANDOFF.md` (P2-UI-00) — all three Gaps (1, 2, 3) called out there as TASK-02's job are addressed above. The permission-matrix cells for `dealer:owner (after TASK-02)` / `dealer:staff (after TASK-02)` now match what `setup.ts`'s `defaultRoleFeatures` declares (see the two new `describe('setup.defaultRoleFeatures — Gap 1 fix ...')` tests in each module's `contracts.test.ts`).

- Commands and results:
  - Baseline (before this task's changes, confirmed by temporarily stashing): `yarn jest src/modules/dealer_onboarding src/modules/dealer_org_rbac src/modules/dealer_orders src/modules/commissions src/modules/payouts` → **11 suites / 267 tests passing** (matches `docs/phase-2-status.md` and P2-UI-00's audit exactly).
  - After this task's changes, same scope: **15 suites / 287 tests passing** (+4 suites, +20 tests — all new, all focused on the three fixes; zero pre-existing tests were deleted, only one pre-existing test's fixture/assertion was updated to match the intentionally corrected merge behavior — see `review.commands.test.ts`'s `'skips auth.role-acl.update only when BOTH the org and every required feature are already present'`, renamed from the old, now-incorrect `'skips ... when the org is already in the ACL'`).
  - Full app suite after changes: `yarn test` → **26 suites / 400 tests passing**, no regressions (this number also includes concurrently in-progress work from other lanes sharing this checkout — see Blockers).
  - `yarn typecheck`: this repo's baseline already fails (143 pre-existing error lines across files unrelated to this task — e.g. `next.config.ts`, `agent_examples/*`, and long-standing `OrganizationScope`/`FilterQuery` mismatches in `dealer_onboarding`/`dealer_org_rbac` route files this task did not touch) both before and after this task's changes; diffing the two runs' affected-file sets shows this task introduced no new typecheck errors. Not fixed here — out of this task's owned paths and pre-existing.

- Blockers or follow-up tasks:
  1. **Operational, needs a human decision — run `yarn mercato auth sync-role-acls` per already-provisioned tenant.** This task's fix is merge-safe going forward and self-heals a tenant's `dealer:owner` RoleAcl the next time *any* dealer in that tenant is approved — but a tenant where no further approvals will ever happen stays however it was left by the pre-fix replace bug until `sync-role-acls` is run against it. Per the task's own instruction, this agent did **not** write or run a migration/reseed script — that decision (which environments, if any, need it) belongs to a human with access to the actual tenant list.
  2. **Seed/fixture risk assessment (requested by the coordinator):** no seed or fixture *script* in this repo creates a multi-dealer-per-tenant scenario (`gift_catalog/lib/demoSeed.ts` and `example/lib/exampleSeeds.ts` are the only seed scripts touching anything adjacent, and neither touches dealer modules) — so there is no automated/CI risk. However, the project's own manually-run `docs/phase-2-testing-guide.md` (§3.6, "Reassign Order to a Different Dealer") explicitly instructs a tester to "Create a second dealer (repeat Section 1 steps 1.1–1.8 with a new email)" against the live dev ALB (`http://giftory-dev-alb-398957740.ap-south-1.elb.amazonaws.com`, per that guide and `CLAUDE.md`) — steps 1.1–1.8 include the admin-approve step. **This is exactly the sequence that triggers Gap 2.** All 174 checklist boxes in that guide are currently unchecked (`grep -c '\[x\]'` → 0), which is evidence the guide has not yet been executed, but it is not proof — nobody but the guide's owner can confirm whether it was run informally outside the checklist. **Verdict: a confirmed "would corrupt real data if the documented test flow is followed" risk; no code-level evidence it already has** in this checkout. Recommend the human owner confirm whether the dev ALB environment has ever had two dealers approved in the same tenant before relying on its current RoleAcl state, and run `sync-role-acls` there if so.
  3. **Shared-checkout note:** this checkout had other lanes' in-progress, uncommitted work present throughout this task (an `apps/dealer-portal` app, `packages/api-client`, `packages/ui` additions) — none of it was touched, but a `git stash`/`git stash pop` cycle used early in this task's verification work briefly (and safely, restored immediately) staged those files too. Future agents on this checkout should avoid stash entirely per README's conflict-avoidance rules; this agent should have scoped verification without it from the start.
  4. Not in scope for this task and not attempted: fixing the pre-existing, repo-wide `yarn typecheck` failures (unrelated files, confirmed pre-existing via baseline diff) or `yarn build`.

- Ready for dependent tasks: Yes — TASK-03, TASK-04, and every dealer-facing UI task (05–16) can now be exercised against a tenant with more than one dealer without hitting Gap 1/2/3. The one remaining caveat is Blocker #1 above: a tenant that already had dealers approved under the pre-fix code needs `sync-role-acls` run against it by a human before its *existing* dealer owners' `dealer_org.*`/`*.dealer_access` grants are trustworthy (newly-approved dealers in any tenant, including that one, are unaffected — they get everything correctly from the very next approval onward).
