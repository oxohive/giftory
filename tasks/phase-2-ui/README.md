# Phase 2 UI implementation task pack

Created: 2026-10-13. Baseline commit: 500b621.

## Status as of 2026-11-23

Tasks P2-UI-00 through P2-UI-16 are implemented and merged to `main` (PR #2, merge commit `37d61f7`). P2-UI-17 ran a 12-step API-level integration journey (`apps/mercato/src/modules/dealer_orders/__integration__/dealer-marketplace-journey.spec.ts`), which passed 12/12 on 2026-10-20. That run used a disposable local Postgres and a production build started by `yarn test:integration:ephemeral`. It did not run against the deployed environment, and it did not render any dealer-portal or admin screen in a browser. See [VERIFICATION.md](VERIFICATION.md). P2-UI-18's documentation was written on 2026-11-23. Its deployment-readiness items are human actions and are listed in [DELIVERY.md](DELIVERY.md).

What is still open (each item was checked against `main` at `5bb2a3c`):

- The three migrations (`dealer_onboarding`, `dealer_org_rbac`, and the second `payouts` migration) have not been applied to any real database.
- No test has rendered the dealer-portal or admin pages in a browser. That means no browser-level accessibility or responsive check has been done either.
- The Phase 1 regression suite has not been re-run since the Phase 2 changes.
- No test checks isolation between two tenants. Isolation between two dealers in the same tenant passed in the 12/12 run.
- Known gaps 2–5 and 7 in [docs/dealer-marketplace-api.md](../../docs/dealer-marketplace-api.md#known-gaps) are still open:
  - the `Idempotency-Key` header is checked but never consumed
  - payouts have no balance guard
  - `adjustment_credit` is excluded from the balance
  - the KYC decryption scope is wrong
  - gap 6, the document `storageKey`, looks already fixed in code: the KYC upload has been multipart since P2-UI-03 and stores the server-generated attachment id. The API reference still lists it as open.
  - registration accepts a caller-chosen `organizationId`

A Milestone 1 hardening branch (`milestone-1-hardening`) is working on several of these. It is not merged, and this file does not claim any of its results.

Labels used in the task index below:

| Label | Meaning |
|---|---|
| Implemented | The code is merged to `main` and its own unit/static tests pass. |
| API-verified | The backend calls this task depends on were exercised by the 12/12 run (real HTTP and real Postgres, local environment only). The Evidence column lists exactly which calls. |
| Not browser-tested | No test has ever rendered these pages. Every accessibility and responsive claim for them comes from source review only. |

## Original planning context (2026-10-13)

When this pack was written, it was a planning deliverable. It made no application, deployment, database or existing specification changes, and all implementation tasks were Planned. The rest of this section describes the state at that time.

Phase 2 has backend modules and recorded unit-test results, but no dedicated dealer portal and no custom administration screens for the five modules. Code review also found unfinished dealer scope integration: dealer_orders/api/dealer/orders/route.ts accepts caller dealerProfileId and its detail route filters by tenant only. Finance routes have similar integration notes; dealer access grants need reconciliation. Passing isolated unit tests do not establish complete workflow or access-control readiness.

The existing untracked docs/phase-2-testing-guide.md belongs to the user and is preserved. Treat it as a test checklist, not proof of completed testing or an authoritative API contract.

Scope: complete FEAT-008 through FEAT-013 UI and the backend prerequisites needed for those screens. The controlling references are spec/phase-2/features/, spec/phase-2/stories/US-005-dealer-marketplace-foundation.md and spec/decisions/. Excludes 3D proofs, automated matching, actual payout transfer, live courier integration and later phases.

## Five background-agent lanes

| Lane | Responsibility | Tasks |
|---|---|---|
| A | Foundation, backend readiness, integration and delivery | 00, 01, 02, 03, 17, 18 |
| B | Dealer identity, onboarding and organization | 04, 05, 06, 07 |
| C | Dealer dashboard and fulfillment | 08, 09, 10 |
| D | Admin onboarding, dealer directory and assignment | 11, 12, 13 |
| E | Dealer/admin finance | 14, 15, 16 |

Each task is individually assignable. A lane executes its tasks sequentially unless ownership is explicitly split first. Do not launch all task files simultaneously.

This session supports FOUR total concurrent agents, including the coordinator, so at most THREE background workers can run here. Five lanes describe ownership, not five simultaneous workers. If the user starts five independent agents elsewhere, the same dependency and ownership gates still apply.

## Execution waves

1. **Contract gate:** A completes 00 and publishes API-CONTRACTS.md and CONTRACT-HANDOFF.md. These are future deliverables, not existing files. Record backend and storefront test baselines.
2. **Foundation/backend gate:** complete 01, 02, 03. They are assigned sequentially to A by default. A may explicitly hand 01's disjoint scaffold scope to another worker while retaining backend ownership, then reclaim it after handoff. 03 depends on 02.
3. **Authentication gate:** B completes 04; D can implement admin tasks and E admin tasks 15/16 against completed contracts concurrently.
4. **Feature wave:** B runs 05-07, C runs 08-10, D runs 11-13, E runs 14-16. Use only available slots. Suggested three-worker schedule: B + C + D, then E replaces the first finished worker. Already completed admin tasks are not repeated.
5. **Integration gate:** A completes 17, then 18. Only verified integration clears completion; a collection of independently built screens is insufficient.

An agent may read code and prepare tests for a pending dependency, but must not implement guessed contracts or claim readiness before its dependency handoff.

## Conflict avoidance and safe execution

- Read applicable AGENTS.md before implementation. The backend references missing .ai guides and .agents skills in this checkout; task 00 must resolve that prerequisite using the documented setup workflow. Do not install or initialize tools merely to read this planning pack.
- Feature agents own only paths in their task. A owns manifests/lockfiles, shared UI/client, global CSS, app layouts, navigation and common test/config files. B owns auth/session/proxy; feature agents consume its public contract.
- A owns backend API/command/setup changes. D/E own only their module UI, widgets and translation files. Requests for API changes go to A, not parallel edits.
- Do not edit node_modules or generated discovery output by hand. A runs generation after merging discovery additions.
- Prefer isolated branches/worktrees when available. If agents share this checkout, enforce path ownership strictly and never use broad staging, reset, clean or stash operations against another agent's work.
- One agent updates its own task handoff. A alone edits this index and consolidated evidence. Keep unrelated existing changes intact.
- No live database writes, migrations, infrastructure application, production publishing or Git push are required for this planning deliverable.
- Preserve existing public API compatibility, admin/customer sessions and storefront appearance. Backend corrections must have focused regression coverage.
- Completion labels: Planned -> Ready (dependencies verified) -> In progress -> Review -> Verified. Use Blocked with an exact dependency; never silently omit required functionality.

## Task index

Dependency numbers below refer to P2-UI task IDs.

Statuses below were re-checked on 2026-11-23 against the git history and the code on `main` (`5bb2a3c`). Evidence means the 12/12 run of `dealer-marketplace-journey.spec.ts` on 2026-10-20. It called `apps/mercato` directly, so the dealer portal's own BFF proxy (`/api/om/*`) was never part of that run.

| Task | Deliverable | Lane | Depends on | Status | Commits | Evidence from the 12/12 run |
|---|---|---|---|---|---|---|
| [P2-UI-00](TASK-00-contract-audit-and-implementation-preflight.md) | Contract audit and implementation preflight | A | none | Done | `90cea7e` | n/a (documentation). Its gaps 1–3 were later fixed by 02/03. Gaps 2–5 and 7 in the API reference are still open (gap 6 looks fixed in code). |
| [P2-UI-01](TASK-01-dealer-portal-scaffold-and-shared-ui-foundation.md) | Dealer portal scaffold and shared UI foundation | A | 00 | Implemented | `99d79f8`, `a886c33` | n/a. `npm run build` and `npm test` (300/300) of `apps/dealer-portal` pass locally (re-run 2026-11-23). |
| [P2-UI-02](TASK-02-dealer-authorization-and-data-isolation-prerequisite.md) | Dealer authorization and data isolation prerequisite | A | 00 | Implemented, API-verified | `159336b`, `ccd4d0c`, then fixes `70b94d0`, `c4ad820`, `0796a28` | Dealer B, in the same tenant, gets 404 on dealer A's order detail. Dealer A's assignment and earnings are excluded from B's lists. B's balance stays 0. B's status change on A's order is rejected. **A second tenant was never tested.** |
| [P2-UI-03](TASK-03-missing-ui-data-and-lifecycle-apis.md) | Missing UI data and lifecycle APIs | A | 00, 02 | Implemented, API-verified | `db63874`, `ccd4d0c`, then fixes `849caaa`, `fbe097c`, `dc1d076` | Multipart KYC upload; dashboard 200; staff deactivate, after which the deactivated user can no longer log in; order list. Approval and assignment emails were not asserted. |
| [P2-UI-04](TASK-04-dealer-authentication-and-access-states.md) | Dealer authentication and access states | B | 00, 01, 02, 03 | Implemented, API-verified, not browser-tested | `b69028d`, `faf4acf` | Backend login and invite password setup (`/api/auth/reset/confirm`). Anonymous callers get 401 on dealer routes. |
| [P2-UI-05](TASK-05-dealer-registration-and-kyc-screens.md) | Dealer registration and KYC screens | B | 01, 03, 04 | Implemented, API-verified, not browser-tested | `28487ba` | Register 201 (two dealers), upload 201, reject → resubmit → approve. |
| [P2-UI-06](TASK-06-dealer-profile-and-capabilities-screens.md) | Dealer profile and capabilities screens | B | 01, 03, 04 | Implemented, API-verified, not browser-tested | `9dc442f` | Owner capabilities PUT returns 200. Staff capabilities PUT returns 403. A rejected dealer's profile GET returns 404. |
| [P2-UI-07](TASK-07-dealer-staff-management-screens.md) | Dealer staff management screens | B | 01, 03, 04 | Implemented, API-verified, not browser-tested | `1a6cfb1`, `dc1d076` | Invite 201 with `userId`, invite password setup, deactivate 200, and the deactivated user can no longer log in. The staff list GET was not called. |
| [P2-UI-08](TASK-08-dealer-dashboard.md) | Dealer dashboard | C | 01, 03, 04 | Implemented, API-verified, not browser-tested | `f8e1d8a`, `a886c33` | `GET /dealer/dashboard` returns 200. The count values were not asserted. |
| [P2-UI-09](TASK-09-dealer-assigned-orders-list.md) | Dealer assigned orders list | C | 01, 02, 03, 04 | Implemented, API-verified, not browser-tested | `316b58b` | The list includes the dealer's own assignment and excludes other dealers' assignments. |
| [P2-UI-10](TASK-10-dealer-order-detail-and-production-status.md) | Dealer order detail and production status | C | 01, 02, 03, 04 | Implemented, API-verified, not browser-tested | `45bf3f7` | The status moves through every step to `dispatched`; after that, a backward change returns 400. Another dealer reading the detail gets 404. |
| [P2-UI-11](TASK-11-admin-kyc-application-review.md) | Admin KYC application review | D | 00, 03 | Implemented, API-verified, not browser-tested | `ba1dbba` | Approving before review returns 400. Approve and reject return 200. The list and detail GETs were not called. |
| [P2-UI-12](TASK-12-admin-dealer-directory-and-capabilities.md) | Admin dealer directory and capabilities | D | 00, 03 | Implemented, not browser-tested | `ed4c729` | **Not exercised.** The directory and the admin capabilities API were not called. |
| [P2-UI-13](TASK-13-admin-order-assignment-ui.md) | Admin order assignment UI | D | 00, 02, 03 | Implemented, API-verified, not browser-tested | `7609228` | Assign with `Idempotency-Key` returns 201 on a paid order inserted directly into the database. Reassign, cancel and history were not called. |
| [P2-UI-14](TASK-14-dealer-earnings-and-ledger-screens.md) | Dealer earnings and ledger screens | E | 00, 01, 02, 04 | Implemented, API-verified, not browser-tested | `b51aa19` | The earnings list has at least one item, and the balance returns 200. The ledger entry list was not called. |
| [P2-UI-15](TASK-15-admin-commission-management.md) | Admin commission management | E | 00, 02 | Implemented, not browser-tested | `c3068b6` | **Rules API not exercised.** The run created no commission rule, so the snapshot resolved to 0 bps. |
| [P2-UI-16](TASK-16-admin-ledger-payout-recording-and-adjustments.md) | Admin ledger, payout recording and adjustments | E | 00, 02 | Implemented, API-verified, not browser-tested | `414f98a` | Payout returns 201. Adjustments were not called. The balance values were not asserted. |
| [P2-UI-17](TASK-17-integration-accessibility-and-regression-verification.md) | Integration, accessibility and regression verification | A | 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16 | Review, journey passed. Three gaps are open. | `dd7c121` … `6e44da4` | 12/12 on 2026-10-20. Still open: browser accessibility, Phase 1 regression, second tenant (see [VERIFICATION.md](VERIFICATION.md)). |
| [P2-UI-18](TASK-18-delivery-documentation-and-deployment-readiness.md) | Delivery documentation and deployment readiness | A | 17 | In progress. Docs done; deployment items need a human. | this branch | n/a. See [DELIVERY.md](DELIVERY.md). |

## Shared acceptance requirements

Every screen supports loading, empty, error/retry, permission denial, session expiry and meaningful mutation feedback. Use localized admin UI, responsive layouts, keyboard access, accessible names and focus handling. Server authorization is required regardless of hidden navigation. Use integer paise and basis points; timestamps and weekly totals have explicit timezone semantics. Use real data, no production mock fallbacks.

Unit and contract tests cover validations and guards; route tests cover isolation and permissions; browser tests cover the complete workflow. Record skipped tests and unmet environmental prerequisites. Live payment/notification delivery must not be claimed from a mocked test.

## Launching an agent

Use [AGENT-PROMPTS.md](AGENT-PROMPTS.md). Give each worker exactly one active task and this README. The coordinator promotes tasks only after dependency checks, integrates shared changes, and records verification. (When this pack was written, preparing these files did not start any implementation. Implementation has since been completed. See "Status as of 2026-11-23" above.)
