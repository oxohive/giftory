# Project status — Giftory

Last updated: 2026-11-23. Checked against `main` at `5bb2a3c` (last commit 2026-10-20), the code, and the recorded test evidence. This replaces the 2026-10-14 version, which still described the dealer portal as a scaffold and the Phase 2 UI as unbuilt.

## Summary

| Phase | Scope | State |
|---|---|---|
| Phase 1 | Commerce foundation: catalog, cart, checkout, payments, accounts, admin | **Implemented, deployed.** The Phase 1 end-to-end suite has not fully passed. US-002 is In Progress (see [spec/phase-1/index.md](../spec/phase-1/index.md)), and it has not been re-run since the Phase 2 changes. |
| Phase 2 backend | Dealer marketplace modules: onboarding/KYC, org RBAC, order assignment, commissions, payout ledger | **Implemented** and merged (PR #2, `37d61f7`). The code is deployed; the database schema it needs is **not** (see "Still open") |
| Phase 2 UI | Dealer portal (`apps/dealer-portal`, 18 pages) plus admin screens for all five modules | **Implemented**: task pack P2-UI-00…16 is done. No screen has ever been tested in a browser |
| Phase 2 verification | End-to-end against a real backend | **The API-level journey passed 12/12** on 2026-10-20, against a disposable local Postgres and a production build, not the deployed environment. There is still no browser, accessibility, second-tenant or Phase 1 regression run |
| Phase 3+ | 3D customization, proofs, production/shipping, auto-matching, AI assistant, corporate gifting | Not started |

A Milestone 1 hardening branch (`milestone-1-hardening`) is in progress. It aims at several of the open items below. It is not merged to `main` and not deployed. Its own record is in [tasks/milestone-1/PROGRESS.md](../tasks/milestone-1/PROGRESS.md), and none of its results are counted here.

---

## Phase 1 — Commerce Foundation (implemented)

| Area | What works |
|---|---|
| Customer storefront | Product catalog, product detail, gift occasions, server-side cart, checkout, order confirmation |
| Customer accounts | Registration, login, email verification, password reset, address book, order history |
| Payments | Stripe and Razorpay (UPI, cards, netbanking), with webhook handlers for both |
| Admin | Gift product profiles, occasion management, commerce management |
| Infrastructure | AWS deployment config, build/deploy pipeline, HTTPS domains, idle shutdown and wakeup |

Apps:
- `apps/mercato`: backend + admin, port 3000
- `apps/storefront`: customer storefront, port 3100, on Vercel
- `apps/mobile`: Expo customer app, Phase 1 port (see its README)

---

## Phase 2 — Dealer marketplace

### Backend (`apps/mercato/src/modules/`)

| Feature | Module | What it does |
|---|---|---|
| FEAT-008 Dealer onboarding and KYC | `dealer_onboarding` | Self-registration (invite link only), multipart KYC upload to S3, admin approve/reject, resubmission, approval/rejection emails |
| FEAT-009 Dealer permissions and staff | `dealer_org_rbac` | Shared `dealer:owner`/`dealer:staff` roles, production capabilities, staff invite/list/deactivate, admin dealer directory |
| FEAT-011 Order assignment | `dealer_orders` | Manual assign/reassign/cancel with history, dealer status transitions, dealer dashboard aggregates, assignment email |
| FEAT-012 Commission engine | `commissions` | Tiered rules, immutable per-order snapshots, dealer earnings |
| FEAT-013 Payout foundation | `payouts` | Append-only ledger, balances, manual payout recording, adjustments |

Endpoint reference: [docs/dealer-marketplace-api.md](dealer-marketplace-api.md).

Dealer-level isolation used to be the biggest gap: routes trusted a client-supplied `dealerProfileId`. That is **fixed** (P2-UI-02). Dealer routes now derive the caller's dealer profile from the session.

### UI

- **Dealer portal** (`apps/dealer-portal`, Next.js 16):
  - auth: login, forgot/reset password, pending, access-denied, forbidden
  - onboarding: register, documents, status, resubmit
  - portal: dashboard, orders list and detail with status updates, profile, capabilities, staff, earnings, ledger

  The browser talks only to the portal. A server-side BFF proxy (`/api/om/*`) forwards an allowlist of routes to the backend, and session cookies stay first-party on the portal origin. On 2026-11-23, `npm test` (300/300), typecheck, lint and `npm run build` all passed locally. According to `CLAUDE.md`/`README.md` it is deployed to Vercel at `giftory-blue.vercel.app`. That was not checked tonight.
- **Admin screens** (inside `apps/mercato`):
  - KYC applications list and detail (`/backend/dealers/applications`)
  - dealer directory and capabilities (`/backend/dealers`)
  - an assignment tab injected into the sales order page
  - commission rules and per-dealer commission history
  - payouts and per-dealer ledger, with payout and adjustment dialogs

Per-task status and evidence: [tasks/phase-2-ui/README.md](../tasks/phase-2-ui/README.md).

### How the money flows

1. The admin assigns a paid order to a dealer, which emits `dealer_order.assigned`.
2. A subscriber snapshots the commission at that moment. The rate and amount are frozen from then on.
3. A second subscriber credits the dealer's ledger with the commission.
4. The admin records payouts against the balance. Corrections are made as adjustment entries, never as edits.

The ledger is append-only by construction: `payouts` has no update or delete paths. Payouts are **recorded, not disbursed**. No money moves.

### What has been verified, and how

| Evidence | Date | What it covers |
|---|---|---|
| `apps/mercato` Jest (`yarn test`) | 2026-10-20: 638/638. Coordinator re-run on 2026-11-23: 637/638, with the 1 failure being a Windows-only path-separator bug in a test helper | Unit and route tests, with mocked persistence for most Phase 2 modules |
| `apps/dealer-portal` `npm test` | 2026-11-23: 300/300 | Pure-logic and source-contract tests (no DOM rendering) |
| `dealer-marketplace-journey.spec.ts` via `yarn test:integration:ephemeral` | 2026-10-20: **12/12** | Real HTTP and real Postgres in a disposable local environment. It covered two dealers in one tenant, invite password setup, KYC upload, reject/resubmit/approve, capabilities and staff permissions, staff invite and deactivate, assignment with commission snapshot and ledger credit, dealer views, same-tenant cross-dealer isolation, the full status sequence, and a payout. Details: [VERIFICATION.md](../tasks/phase-2-ui/VERIFICATION.md) |

Getting the journey to 12/12 uncovered and fixed seven real bugs, listed in VERIFICATION.md. Three of them blocked any real dealer from ever finishing onboarding:
- the dealer tables had no migrations at all
- non-admin dealers hit a 403 because of a wrong-shape scope call
- approval clobbered the role ACL shared by all dealer owners

### Still open (as of `main` at `5bb2a3c`)

1. **Migrations not applied to any real database.** `dealer_onboarding` and `dealer_org_rbac` (the tables `dealer_profiles`, `dealer_kyc_documents`, `dealer_capabilities`) and the second `payouts` migration (`created_by` nullable) are unapplied. On 2026-10-20 the shared dev database had none of the three dealer tables. Deploys do not run migrations, so until a human applies them, dealer onboarding cannot work in any real environment, even though the code is deployed.
2. **Production configuration for dealer emails appears to be missing.** `infra/ecs.tf` sets no `APP_URL`, `DEALER_PORTAL_BASE_URL`, email provider or from-address. That means no invite emails, so new dealers can't set a password. Approval and assignment emails would also fail. This was not checked against the live task definition. See [tasks/phase-2-ui/DELIVERY.md](../tasks/phase-2-ui/DELIVERY.md) §3.
3. **No browser test of any Phase 2 screen.** No accessibility, keyboard or responsive pass has been made against the rendered portal or admin pages.
4. **Isolation between two tenants has not been tested.** Isolation between two dealers in the same tenant has been, and passed.
5. **The Phase 1 regression suite has not been re-run** since the Phase 2 changes. US-002 is still In Progress.
6. **Known backend gaps 2–7** ([API reference § Known gaps](dealer-marketplace-api.md#known-gaps)):
   - `Idempotency-Key` is required but never consumed
   - no payout balance guard
   - `adjustment_credit` is excluded from `pendingAmount`
   - wrong encryption scope when decrypting KYC fields
   - `storageKey` is not validated
   - register accepts a caller-chosen `organizationId`
7. **Invite links go to the backend, not the portal.** Owner and staff invite emails link to the backend's own `/reset/<token>` page. The fix lives in `@open-mercato/core`.
8. **Places where the specs are only partly met:**
   - assignment shows all approved dealers, with capability hints only (FEAT-011 req 2)
   - no per-entry running balance (FEAT-013 req 5)
   - `dealer_order.status_updated` is emitted but nothing consumes it (FEAT-010 req 6)
9. **IaC drift.** The dealer-portal Vercel project was created by hand. Its Terraform resource (`infra/vercel.tf`) has not been applied or imported, and its project name and install command disagree with the real project.
10. **Some subscriber logs include `tenantId`**, which conflicts with the logging rule in `CLAUDE.md`.

The human actions are collected in [DELIVERY.md §7](../tasks/phase-2-ui/DELIVERY.md#7-actions-only-a-human-can-take).

### Storage

KYC documents and catalog product images have persisted in S3 since 2026-10-20 (bucket `giftory-dev-kyc-documents`). Before that, both were being written to the ECS task's local disk, which is wiped on every scale-to-zero cycle and every redeploy. Any product image uploaded before that date is very likely unrecoverable.

**Deferred: a dealer-facing mobile app.** A dealer field app is a reasonable future surface. It would be separate from `apps/mobile` (the customer shopping app), not an extension of it. It is deferred until the web portal has been proven in a browser and in the deployed environment.

---

## Deployment topology

| Component | Host | Notes |
|---|---|---|
| Backend + admin (`apps/mercato`) | AWS ECS Fargate Spot, `ap-south-1`, public host `admin.giftory.dev.oxohive.com` | Scales to zero after 30 minutes idle. CodeBuild deploys on every push to `main` (unit tests, image build, ECS update). No migration step |
| Storefront (`apps/storefront`) | Vercel, `giftory-storefront.vercel.app` | |
| Dealer portal (`apps/dealer-portal`) | Vercel project `giftory`, `giftory-blue.vercel.app` (per `CLAUDE.md`) | Created by hand; not in Terraform state |

---

## Documentation map

| Document | Contents |
|---|---|
| [README.md](../README.md) | Setup, run, database, storage and payment configuration |
| [docs/architecture.md](architecture.md) | System architecture, data model, roadmap |
| [docs/dealer-marketplace-api.md](dealer-marketplace-api.md) | Phase 2 endpoint reference and known gaps |
| [docs/phase-2-status.md](phase-2-status.md) | This document |
| [docs/phase-2-testing-guide.md](phase-2-testing-guide.md) | Manual checklist for the live environment, annotated with what the automated journey covered |
| [tasks/phase-2-ui/README.md](../tasks/phase-2-ui/README.md) | Phase 2 UI task pack: per-task status and evidence |
| [tasks/phase-2-ui/VERIFICATION.md](../tasks/phase-2-ui/VERIFICATION.md) | P2-UI-17 integration results and the bugs found |
| [tasks/phase-2-ui/DELIVERY.md](../tasks/phase-2-ui/DELIVERY.md) | Deployment plan, env vars, smoke test, rollback, human actions |
| [tasks/milestone-1/PROGRESS.md](../tasks/milestone-1/PROGRESS.md) | Milestone 1 hardening run (in progress) |
| `apps/storefront/docs/backend-api-contract.md` | Storefront API contract |
