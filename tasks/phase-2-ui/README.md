# Phase 2 UI implementation task pack

Created: 2026-10-13. Baseline commit: 500b621.

## Current state and purpose

This is a planning deliverable. No application, deployment, database or existing specification changes are made by this task pack. All implementation tasks below remain Planned.

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

| Task | Deliverable | Lane | Depends on | Status |
|---|---|---|---|---|
| [P2-UI-00](TASK-00-contract-audit-and-implementation-preflight.md) | Contract audit and implementation preflight | A | none | Review |
| [P2-UI-01](TASK-01-dealer-portal-scaffold-and-shared-ui-foundation.md) | Dealer portal scaffold and shared UI foundation | A | 00 | Review |
| [P2-UI-02](TASK-02-dealer-authorization-and-data-isolation-prerequisite.md) | Dealer authorization and data isolation prerequisite | A | 00 | Review |
| [P2-UI-03](TASK-03-missing-ui-data-and-lifecycle-apis.md) | Missing UI data and lifecycle APIs | A | 00, 02 | Review |
| [P2-UI-04](TASK-04-dealer-authentication-and-access-states.md) | Dealer authentication and access states | B | 00, 01, 02, 03 | Review |
| [P2-UI-05](TASK-05-dealer-registration-and-kyc-screens.md) | Dealer registration and KYC screens | B | 01, 03, 04 | Review |
| [P2-UI-06](TASK-06-dealer-profile-and-capabilities-screens.md) | Dealer profile and capabilities screens | B | 01, 03, 04 | Review |
| [P2-UI-07](TASK-07-dealer-staff-management-screens.md) | Dealer staff management screens | B | 01, 03, 04 | Review |
| [P2-UI-08](TASK-08-dealer-dashboard.md) | Dealer dashboard | C | 01, 03, 04 | Review |
| [P2-UI-09](TASK-09-dealer-assigned-orders-list.md) | Dealer assigned orders list | C | 01, 02, 03, 04 | Review |
| [P2-UI-10](TASK-10-dealer-order-detail-and-production-status.md) | Dealer order detail and production status | C | 01, 02, 03, 04 | Review |
| [P2-UI-11](TASK-11-admin-kyc-application-review.md) | Admin KYC application review | D | 00, 03 | Review |
| [P2-UI-12](TASK-12-admin-dealer-directory-and-capabilities.md) | Admin dealer directory and capabilities | D | 00, 03 | Review |
| [P2-UI-13](TASK-13-admin-order-assignment-ui.md) | Admin order assignment UI | D | 00, 02, 03 | Review |
| [P2-UI-14](TASK-14-dealer-earnings-and-ledger-screens.md) | Dealer earnings and ledger screens | E | 00, 01, 02, 04 | Review |
| [P2-UI-15](TASK-15-admin-commission-management.md) | Admin commission management | E | 00, 02 | Review |
| [P2-UI-16](TASK-16-admin-ledger-payout-recording-and-adjustments.md) | Admin ledger, payout recording and adjustments | E | 00, 02 | Review |
| [P2-UI-17](TASK-17-integration-accessibility-and-regression-verification.md) | Integration, accessibility and regression verification | A | 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16 | Review — full real journey passes 12/12 live; browser a11y, Phase 1 regression, second tenant still open (see [VERIFICATION.md](VERIFICATION.md)) |
| [P2-UI-18](TASK-18-delivery-documentation-and-deployment-readiness.md) | Delivery documentation and deployment readiness | A | 17 | Planned |

## Shared acceptance requirements

Every screen supports loading, empty, error/retry, permission denial, session expiry and meaningful mutation feedback. Use localized admin UI, responsive layouts, keyboard access, accessible names and focus handling. Server authorization is required regardless of hidden navigation. Use integer paise and basis points; timestamps and weekly totals have explicit timezone semantics. Use real data, no production mock fallbacks.

Unit and contract tests cover validations and guards; route tests cover isolation and permissions; browser tests cover the complete workflow. Record skipped tests and unmet environmental prerequisites. Live payment/notification delivery must not be claimed from a mocked test.

## Launching an agent

Use [AGENT-PROMPTS.md](AGENT-PROMPTS.md). Give each worker exactly one active task and this README. The coordinator promotes tasks only after dependency checks, integrates shared changes, and records verification. Implementation has not been started by preparing these files.
