# Mobile (Expo / React Native) — Task Index

Phase: unassigned in `docs/architecture.md` (mobile is named only as "later phase" — see §2/§3). This directory tracks the first implementation pass, scoped to a standalone app at `apps/mobile` that calls the existing `apps/mercato` backend API directly. It follows the same spec-driven convention as `spec/phase-1/` and `spec/phase-2/`, adapted for parallel background-agent execution.

- **Status:** Implemented, sandbox-verified. All 9 tasks complete — `apps/mobile` exists, typechecks clean (`tsc --noEmit`, 0 errors), and its Android bundle builds successfully via Metro (936 modules, 0 resolution errors). **Never booted on a real simulator/device, and never run against a live `apps/mercato` backend** — see [`IMPLEMENTATION-NOTES.md`](IMPLEMENTATION-NOTES.md) for the full, current list of what still needs live verification (4 wire-shape discrepancies, Razorpay field mapping, `.env` values, the full manual QA pass) before this is production-ready.
- **Depends on:** Phase 1 backend (Implemented — see `spec/phase-1/index.md`).
- **Setup/run instructions:** see [`apps/mobile/README.md`](../../apps/mobile/README.md).
- **Scope decisions (locked in, do not re-derive):**
  - Full Phase 1 feature *surface* (catalog, occasions, cart, checkout, account, order history), but **auth is guest-only for v1** — see TASK-08 for exactly how Account/Orders are scoped under that constraint.
  - **Payment provider: Razorpay only** (`react-native-razorpay`). Stripe is explicitly out of scope for this pass.
  - `apps/mobile` is a **fully standalone Expo app** — no monorepo workspace, no shared `packages/*`, zero changes to `apps/mercato`, `apps/storefront`, or any root file. The API client is a self-contained module ported *into* `apps/mobile`, not shared.

## Task List

| # | File | Owns | Status |
|---|---|---|---|
| 01 | [TASK-01-expo-scaffold.md](tasks/TASK-01-expo-scaffold.md) | App scaffold, nav shell, placeholder screens, env loading | ✅ Done |
| 02 | [TASK-02-design-system.md](tasks/TASK-02-design-system.md) | `src/theme/**`, `src/components/ui/**` | ✅ Done |
| 03 | [TASK-03-api-client-core.md](tasks/TASK-03-api-client-core.md) | `src/lib/api/{http,env,money,idempotency,errors}.ts` | ✅ Done |
| 04 | [TASK-04-api-client-domains.md](tasks/TASK-04-api-client-domains.md) | `src/lib/api/{catalog,occasions,cart,checkout,orders,addresses,payments}.ts` | ✅ Done — 4 discrepancies flagged, need live re-verification |
| 05 | [TASK-05-catalog-feature.md](tasks/TASK-05-catalog-feature.md) | `src/features/catalog/**` | ✅ Done |
| 06 | [TASK-06-cart-feature.md](tasks/TASK-06-cart-feature.md) | `src/features/cart/**` | ✅ Done |
| 07 | [TASK-07-checkout-feature.md](tasks/TASK-07-checkout-feature.md) | `src/features/checkout/**` | ✅ Done — Razorpay field mapping is a best-effort inference, needs live verification |
| 08 | [TASK-08-account-orders-feature.md](tasks/TASK-08-account-orders-feature.md) | `src/features/account/**`, `src/features/orders/**` | ✅ Done |
| 09 | [TASK-09-integration-navigation.md](tasks/TASK-09-integration-navigation.md) | Final nav wiring, `package.json`/`app.json` merge | ✅ Done (sandbox scope) — manual QA against a live backend still open |

Full detail on every deviation, discrepancy, and open item: [`IMPLEMENTATION-NOTES.md`](IMPLEMENTATION-NOTES.md).

## Collision rule

Every task owns an exclusive set of paths (see each file's **Boundaries** section). Only **TASK-01** and **TASK-09** may ever edit `apps/mobile/package.json`, `app.json`, `tsconfig.json`, or `babel.config.js`. Every other task that needs a new npm package lists it under **Dependencies to add** instead of installing it — TASK-09 merges all of these once, at the end.

## Parallelism

```
TASK-01 ─┐
TASK-02 ─┼─ run in parallel, no interdependencies
TASK-03 ─┘
             │
TASK-04 ─────┘ (needs only TASK-03's documented http.ts signature, not finished code)
             │
TASK-05 ─┐
TASK-06 ─┼─ run in parallel once TASK-02 + TASK-04 contracts are read
TASK-07 ─┤
TASK-08 ─┘
             │
TASK-09 ─────┘ (strictly last — real dependency, not a collision)
```

## Reference material used to write these tasks

- Backend endpoints, auth model, cookie/session behavior: researched live against `apps/mercato/src/modules/{storefront,gift_catalog,gateway_razorpay}`.
- Wire shapes, money convention, checkout/payment flow: researched live against `apps/storefront/src/lib/api/*`, `apps/storefront/docs/backend-api-contract.md`.
- Acceptance criteria: `spec/phase-1/features/FEAT-001` through `FEAT-006` (FEAT-007 is admin-only, not ported).
- Dev backend URL: `APP_URL=http://localhost:3000` from `/.env`. Razorpay test keys were supplied by the user directly — the Key Secret is backend-only and never appears in any mobile task file or env var.
