# P2-UI-00: Contract audit and implementation preflight

- Status: Review; audit complete, awaiting coordinator verification (see Agent handoff below)
- Owner lane: A
- Depends on: None
- Owned paths: Planning documents under tasks/phase-2-ui/ only

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [ ] Read FEAT-008 through FEAT-013, US-005 and ADRs; reconcile draft specs against actual route handlers, validators, ACL and setup files.
- [ ] Record exact method/path/request/response/error/pagination/permission contracts in API-CONTRACTS.md; label proposed endpoints as proposed until implemented.
- [ ] Resolve owner versus staff earnings access (FEAT-010 says owner; existing backend intentions differ), KYC pending-user authentication, assignment-ID versus order-ID, assignment history, running ledger balance, eligible-dealer filtering and business-profile edit scope. Verify inactive-rule filters against actual boolean parsing.
- [ ] Locate missing Open Mercato harness guidance referenced by apps/mercato/AGENTS.md through its documented initialization workflow before backend implementation. No fabricated skills or guessed installed framework APIs.
- [ ] Freeze route groups, component exports, navigation entries, permission matrix, package linking, optimistic-concurrency/version contracts and agent file ownership in CONTRACT-HANDOFF.md.

## Acceptance and verification

- [ ] Every screen maps to a verified contract or named prerequisite task.
- [ ] No UI task is marked ready while its required API or auth contract is unresolved.
- [ ] Record baseline Git status and existing test failures separately from new regressions.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [ ] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Review
- Changed files:
  - `tasks/phase-2-ui/API-CONTRACTS.md` (new)
  - `tasks/phase-2-ui/CONTRACT-HANDOFF.md` (new)
  - `tasks/phase-2-ui/TASK-00-contract-audit-and-implementation-preflight.md` (this section)
  - `tasks/phase-2-ui/README.md` (status column for P2-UI-00 only)
  - No application code, database, deployment, or files under `spec/` were touched.
- Verified contracts: all endpoints across `dealer_onboarding`, `dealer_org_rbac`, `dealer_orders`, `commissions`, `payouts` read directly from route/command/setup/acl source and cross-checked against `docs/dealer-marketplace-api.md`; full method/path/request/response/error/pagination/permission detail recorded in API-CONTRACTS.md. All 8 open questions from this task's "Work" section resolved with source citations (owner-vs-staff earnings access, KYC pending-user auth, assignment-ID vs order-ID, assignment history, running ledger balance, eligible-dealer filtering, business-profile edit scope, inactive-rule boolean parsing).
- Commands and results:
  - `cd apps/mercato && yarn jest src/modules/{dealer_onboarding,dealer_org_rbac,dealer_orders,commissions,payouts} --silent` → `Test Suites: 11 passed, 11 total; Tests: 267 passed, 267 total` (12.4s). Matches `docs/phase-2-status.md`'s recorded baseline exactly. No new failures introduced (no app code changed).
  - `git status --short` at start → clean except pre-existing untracked `apps/mobile/` (unrelated, not touched).
  - Read (not executed) `@open-mercato/core`'s auth ACL commands (`commands/acl.ts`) and `rbacService.ts` / `setup-app.ts` to verify RBAC merge-vs-replace semantics — this is what surfaced Gap 2 below.
- Blockers or follow-up tasks (full detail in API-CONTRACTS.md "Critical backend gaps" and CONTRACT-HANDOFF.md):
  1. **New, severe — Gap 1:** `dealer_orders.dealer_access`, `commissions.dealer_access`, `payouts.dealer_access` are declared in each module's `acl.ts` and required by every dealer-facing order/earnings/ledger route, but are never granted to `dealer:owner` or `dealer:staff` anywhere in the codebase (verified by grepping the full `src/` tree). No dealer user can currently reach any of those routes — always `403`. Must be fixed in TASK-02.
  2. **New, severe — Gap 2:** `dealer_onboarding`'s approval command calls the core `auth.role-acl.update` command with a hardcoded, incomplete feature list; that core command does a full **replace** of `RoleAcl.featuresJson` (not a merge). Because `dealer:owner`/`dealer:staff` are single shared tenant-wide roles (per ADR-003), the first dealer approval in a tenant strips `dealer_org.*` grants from every dealer owner, and also flips the role's `organizationsJson` from unrestricted to a specific org list — locking every still-pending dealer out of even checking their own KYC status. Verified by reading the core command's persist logic and the rbacService org-scope evaluation; confirmed untested by the existing unit test, which only asserts on `organizations`, never `features`. Must be fixed in TASK-02, before TASK-02 (or TASK-04 through TASK-16) can be verified against a realistic multi-dealer tenant.
  3. Already-known gaps re-verified against source (dealerProfileId not session-derived on `dealer_orders`/`commissions`/`payouts` dealer routes; `Idempotency-Key` required-but-unconsumed; no payout balance guard; `adjustment_credit` excluded from `pendingAmount`) — all confirmed still present, detailed in API-CONTRACTS.md.
  4. No assignment-history endpoint exists (only current active assignment); no per-entry running ledger balance exists (only an aggregate); no eligible-dealer filter exists server-side (client-side filtering recommended using already-available batch-loaded capabilities); no staff-deactivate endpoint exists (invite-only). Each has a recorded recommendation in API-CONTRACTS.md/CONTRACT-HANDOFF.md so TASK-03/07/13/14/16 are not left to guess.
  5. TASK-13 must confirm the real widget/injection spot id on the core order admin detail page before building — not read as part of this audit (out of the five Phase 2 modules' scope) and not assumed.
  6. Harness/tooling: `apps/mercato/.ai/guides/` and `.ai/skills/` are both present and populated in this checkout — the README's "missing harness guidance" concern is stale; no blocker here.
- Ready for dependent tasks: **No.** Gaps 1 and 2 are backend defects, not UI-task ambiguity — every dealer-facing screen (TASK-04 through TASK-10, TASK-14) is unbuildable against a working backend until TASK-02 fixes them, and TASK-02 itself cannot be marked Ready until a human/agent with backend-change authority (lane A) implements and tests that fix. Admin-only tasks (TASK-11, TASK-12, TASK-15, TASK-16) and the capability-filter portion of TASK-13 are **not** blocked by Gaps 1–2 and may proceed once TASK-01/03 land, per the contract mapping table in API-CONTRACTS.md. This audit's own deliverables (API-CONTRACTS.md, CONTRACT-HANDOFF.md) are complete and every UI task maps to either a verified contract or a named prerequisite — the "No" here reflects the backend's readiness, not this task's completeness.
