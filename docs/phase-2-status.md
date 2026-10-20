# Project status — Giftory

Last updated: 2026-10-14, verified against commit `500b621` and the working tree.

## Summary

| Phase | Scope | State |
|---|---|---|
| Phase 1 | Commerce foundation (catalog, cart, checkout, payments, accounts, admin) | **Implemented** |
| Phase 2 backend | Dealer marketplace: onboarding, RBAC, orders, commissions, payouts | **Implemented, 267 unit tests passing** |
| Phase 2 UI | Dealer portal + admin review screens (19 tasks) | **Planned** — scaffold started, not implemented |
| Phase 2 live verification | End-to-end runs against a live backend | **Not executed** — checklist exists, boxes unchecked |
| Phase 3+ | 3D customization, proofs, production/shipping, auto-matching, AI assistant, corporate gifting | Not started |

---

## Phase 1 — Commerce Foundation (implemented)

| Area | What works |
|---|---|
| Customer storefront | Product catalog, product detail, gift occasions, server-side cart, checkout, order confirmation |
| Customer accounts | Registration, login, email verification, password reset, address book, order history |
| Payments | Stripe and Razorpay (UPI, cards, netbanking), webhook handlers for both |
| Admin | Gift product profiles, occasion management, commerce management |
| Infrastructure | AWS deployment config, build/deploy pipeline, HTTPS domains, idle shutdown and wakeup |

Apps: `apps/mercato` (backend + admin, port 3000), `apps/storefront` (customer storefront, port 3100).

---

## Phase 2 backend — Dealer marketplace (implemented)

All five backend features are implemented and their unit tests pass. Test run on 2026-10-14:

```
Test Suites: 11 passed, 11 total
Tests:       267 passed, 267 total
```

| Feature | Module | What it does | Tests |
|---|---|---|---|
| FEAT-008 Dealer onboarding and KYC | `dealer_onboarding` | Self-registration, document submission, admin approve/reject, resubmission | 5 suites |
| FEAT-009 Dealer permissions and staff | `dealer_org_rbac` | Org access control, production capabilities, staff invitations, admin dealer directory | 3 suites |
| FEAT-011 Order assignment | `dealer_orders` | Manual assign/reassign/cancel, dealer status transitions | 1 suite |
| FEAT-012 Commission engine | `commissions` | Tiered rules, immutable per-order snapshots, dealer earnings | 1 suite |
| FEAT-013 Payout foundation | `payouts` | Append-only ledger, balances, payout recording, adjustments | 1 suite |

Full endpoint documentation: [docs/dealer-marketplace-api.md](dealer-marketplace-api.md).

### How the money flows

1. Admin assigns a paid order to a dealer → `dealer_order.assigned`.
2. A subscriber snapshots the commission at that moment (rate + amount frozen forever).
3. A second subscriber credits the dealer's ledger with the commission.
4. Admin records payouts against the balance; corrections are adjustment entries, never edits.

The ledger is append-only by construction — there are no update or delete paths anywhere in `payouts`.

### What the backend does *not* do yet

- **Actual money movement.** Payouts are recorded manually against a ledger; there is no disbursement integration.
- **Dealer-level data isolation.** Dealer-facing routes scope by tenant but trust a client-supplied `dealerProfileId` rather than deriving it from the session. This is the single most important gap and is tracked as prerequisite task P2-UI-02. See "Known gaps" in the API reference.
- **Idempotency.** The `Idempotency-Key` header is required on assignment writes but nothing consumes it; payout/adjustment routes accept no key and have no balance-sufficiency guard.
- **Automated dealer matching.** Assignment is manual only.

---

## Phase 2 UI — Planned, not implemented

A 19-task implementation pack exists at [`tasks/phase-2-ui/`](../tasks/phase-2-ui/README.md), split into five background-agent lanes:

| Lane | Responsibility | Tasks |
|---|---|---|
| A | Foundation, backend readiness, integration, delivery | 00, 01, 02, 03, 17, 18 |
| B | Dealer identity, onboarding, organization | 04, 05, 06, 07 |
| C | Dealer dashboard and fulfillment | 08, 09, 10 |
| D | Admin onboarding review, dealer directory, assignment | 11, 12, 13 |
| E | Dealer/admin finance | 14, 15, 16 |

**Every task is still at status `Planned`.** Execution is gated: contract audit (00) → foundation and backend prerequisites (01–03) → authentication (04) → feature wave → integration and regression (17) → delivery documentation (18). Agent launch prompts are in [AGENT-PROMPTS.md](../tasks/phase-2-ui/AGENT-PROMPTS.md).

What exists today in the repo:

- `apps/dealer-portal/` — a **bare Next.js scaffold only** (layout, error and loading screens). No pages, no auth, no data fetching. Next step is task P2-UI-01.
- `packages/api-client`, `packages/ui` — thin shared-package scaffolds intended for the portal.
- No custom admin screens exist for the five Phase 2 modules; admin review of KYC, dealers, assignment, commissions and payouts is API-only right now.

**Deferred: a dealer-facing mobile app.** A dealer field app (assigned orders, production status updates, earnings) is a reasonable future surface — but a separate one from `apps/mobile` (the customer shopping app), not an extension of it. Deliberately deferred until the web dealer portal above is actually built and proven against real contracts, rather than building two unproven UIs against the same unproven contracts at once. Revisit once P2-UI-17/18 (integration + delivery) land.

---

## Live verification status

[docs/phase-2-testing-guide.md](phase-2-testing-guide.md) is a prepared checklist for exercising the dealer flows end to end against a running backend. **It has not been executed** — no boxes are checked, and the passing unit tests do not establish workflow or access-control correctness in a live environment. Recorded deployment: `admin.giftory.dev.oxohive.com` (backend, AWS ECS Fargate); storefront (`giftory-storefront.vercel.app`) and dealer portal (`giftory-blue.vercel.app`) are separate Vercel deployments, not the same infrastructure as the backend.

KYC documents and catalog product images persist in S3 as of 2026-10-20 (bucket `giftory-dev-kyc-documents`) — both were silently writing to the backend ECS task's local disk before that, which is wiped on every scale-to-zero cycle and redeploy. Any product image uploaded before that date is very likely unrecoverable.

---

## Documentation map

| Document | Contents |
|---|---|
| [README.md](../README.md) | Setup, run, database and payment configuration |
| [docs/architecture.md](architecture.md) | System architecture, data model, roadmap |
| [docs/dealer-marketplace-api.md](dealer-marketplace-api.md) | Phase 2 endpoint reference and known gaps |
| [docs/phase-2-status.md](phase-2-status.md) | This document |
| [docs/phase-2-testing-guide.md](phase-2-testing-guide.md) | Live end-to-end checklist (not yet executed) |
| [tasks/phase-2-ui/](../tasks/phase-2-ui/README.md) | The 19-task UI implementation plan |
| `apps/storefront/docs/backend-api-contract.md` | Storefront API contract |
