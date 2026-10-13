# P2-UI-00: Contract handoff — freezes for Phase 2 UI implementation

Produced by: P2-UI-00. Companion to [API-CONTRACTS.md](API-CONTRACTS.md), which this document assumes. Read that file's "Critical backend gaps" section first — several freezes below are conditional on TASK-02 landing.

This document freezes decisions so that lanes B/C/D/E do not each invent their own answer. Nothing here overrides [README.md](README.md)'s lane/ownership table — see [File ownership](#file-ownership-going-forward) at the bottom, which mirrors it rather than redesigning it.

---

## Route groups

### Dealer portal (`apps/dealer-portal`, port 3200, Next.js App Router)

FEAT-010 specifies these pages; frozen as-is (no renaming) since no conflicting evidence was found in code:

| Route | Page | Role | Backend contract |
|---|---|---|---|
| `/` | Dashboard | owner, staff | Aggregates — blocked by Gap 1/3 until TASK-02 |
| `/orders` | Assigned orders list | owner, staff | `GET /api/dealer_orders/dealer/orders` |
| `/orders/[id]` | Order detail (`[id]` = **assignment ID**, not order ID — see API-CONTRACTS.md) | owner, staff | `GET /api/dealer_orders/dealer/orders/{assignmentId}` |
| `/orders/[id]/status` | Update production status | owner, staff | `POST /api/dealer_orders/dealer/orders/{assignmentId}/status` |
| `/profile` | Business profile (read-only display + capabilities edit entry point) | owner | `GET /api/dealer_org_rbac/dealer/profile` |
| `/profile/capabilities` | Edit capabilities (the **only** editable profile surface — see API-CONTRACTS.md "business-profile edit scope") | owner | `PUT /api/dealer_org_rbac/dealer/profile/capabilities` |
| `/staff` | Manage staff (invite only — **no deactivate endpoint exists**, see below) | owner | `POST /api/dealer_org_rbac/dealer/staff/invite` |
| `/earnings` | Commission + ledger (read-only) | owner | `GET /api/commissions/dealer/earnings`, `GET /api/payouts/dealer/ledger`, `GET /api/payouts/dealer/ledger/balance` |
| Auth pages (login, session-expired, pending-KYC holding page) | — | — | Core-auth endpoints; see TASK-04 |

**Decision — `/staff` deactivate — UPDATED by TASK-03:** the backend endpoint now exists (`GET /api/dealer_org_rbac/dealer/staff` for the roster, `POST /api/dealer_org_rbac/dealer/staff/{id}/deactivate`) — see API-CONTRACTS.md's `dealer_org_rbac` section. TASK-07 may now build the real invite + list + deactivate screen; the earlier freeze ("ship invite-only, omit the Deactivate affordance") no longer applies. Self-deactivation is rejected server-side (400) — the UI should simply never render a Deactivate action on the caller's own row (the roster's `id` field lets the UI detect this), not rely on the 400 as the only guard.

**Decision — pending-KYC holding page:** a dealer who registers and logs in before approval needs *something* to see other than a 404/403. Freeze: `/` (dashboard) must detect `kycStatus !== 'approved'` from `GET /api/dealer_onboarding/dealer/onboarding/status` and render a holding state (status badge + rejection reason if rejected + a resubmit CTA if rejected), never attempt to call any `dealer_org_rbac`/`dealer_orders`/`commissions`/`payouts` route while unapproved — those all 404/403 pre-approval by design (`dealer_org.view` requires approved profile; the other three are Gap-1-blocked regardless). TASK-04 owns this gate; TASK-08 (dashboard) consumes it rather than re-implementing it.

### Admin screens (`apps/mercato`, Open Mercato backend convention)

Open Mercato's auto-discovery convention: `backend/<path>.tsx` → `/backend/<path>` (verified in `@open-mercato/core/AGENTS.md`). Each Phase 2 module owns its own admin screens under its own `backend/` tree — this keeps module isolation intact (no cross-module file ownership) and matches how every other OM module organizes backend pages.

| Module | Backend page path | Admin route | Owning task |
|---|---|---|---|
| `dealer_onboarding` | `dealer_onboarding/backend/dealers/applications/page.tsx` + `[id]/page.tsx` | `/backend/dealers/applications`, `/backend/dealers/applications/{id}` | TASK-11 |
| `dealer_org_rbac` | `dealer_org_rbac/backend/dealers/page.tsx` + `[id]/page.tsx` | `/backend/dealers`, `/backend/dealers/{id}` | TASK-12 |
| `dealer_orders` | `dealer_orders/backend/orders/[id]/assignment/page.tsx` (likely a widget/panel injected into the existing core order detail page rather than a standalone route — confirm against how the core `orders` module's admin detail page is extended before building; do not assume a standalone page is the right shape) | Injected into existing order detail, or `/backend/dealer-orders/{dealerId}` for the per-dealer view | TASK-13 |
| `commissions` | `commissions/backend/commission-rules/page.tsx` | `/backend/commission-rules` | TASK-15 |
| `payouts` | `payouts/backend/dealers/[id]/ledger/page.tsx` | `/backend/dealers/{id}/ledger` | TASK-16 |

**Decision — TASK-13's assignment UI location:** FEAT-011 says "assign from the order detail page in the admin panel." The existing core `orders` admin detail page is owned by the core `sales`/checkout module, not by `dealer_orders`. Per the `@open-mercato/core` extensibility contract (widget injection, `admin.page:<path>:before|after` spot ids), TASK-13 should inject a "Dealer assignment" panel widget into the core order detail page rather than duplicating order display in a new `dealer_orders`-owned page. **TASK-13 must confirm the exact spot id on the live order detail page before building** — this audit did not read the core `sales`/orders admin page source, so the exact spot id is not verified here; treat it as TASK-13's first implementation step, not a guess to carry forward.

---

## Component export conventions

`packages/ui` (`@gift/ui`) exports **named function exports** from two entry points (verified from `packages/ui/src/index.tsx` and `package.json`):

```json
"exports": { ".": "./src/index.tsx", "./money": "./src/money.ts" }
```

Currently exported: `StatusBadge`, `EmptyState`, `ErrorNotice`, `formatDate`, `formatMoney`, `toMinorUnits`, `toMajorUnits` (the latter two re-exported from `./money` at the root too). **Freeze:** every new shared component added for the dealer portal or admin screens follows this same pattern — named function export, no default exports, added to `packages/ui/src/index.tsx` (or a new file re-exported from there) rather than scattered across per-task files. This keeps `@gift/ui`'s surface area auditable from one file.

**Money helper warning (repeated from API-CONTRACTS.md because it is easy to get wrong in practice):** `toMinorUnits()`/`toMajorUnits()` exist for Phase 1 storefront values that arrive from Open Mercato core as decimal major units. **Every money value from the five Phase 2 modules (commission amounts, subtotal, ledger amounts, balances) is already integer paise.** Call `formatMoney()` directly on them; never run them through `toMinorUnits()` first. A TASK-14/15/16 component that does `formatMoney(toMinorUnits(commissionAmount))` will silently render amounts 100x too large.

Admin-side components live inside each module's own `components/` directory (existing precedent: `dealer_onboarding/components/ApplicationsTable.tsx`, `adminShared.tsx`) and are not expected to be shared via a package — module isolation applies to admin UI the same as to backend code (no cross-module imports; share admin UI pieces, if truly needed, via Open Mercato's widget/component-override mechanism, not via direct import).

---

## Navigation entries

### Dealer portal
No in-app navigation component exists yet (bare scaffold). **Freeze:** TASK-01 builds a single shared `<PortalNav>` (or equivalent) in the dealer-portal app itself (not `packages/ui`, since it's app-shell chrome specific to this one app's route list) with entries for Dashboard / Orders / Profile / Staff (owner only) / Earnings (owner only), gated client-side on the role resolved from the session **and** re-checked server-side on every page per the shared acceptance rule ("server authorization is required regardless of hidden navigation").

### Admin backend
Open Mercato's sidebar injection convention (`menu:sidebar:main` spot, declarative `menuItems` in `widgets/injection-table.ts`) — verified as the documented mechanism in `@open-mercato/core/AGENTS.md`. **Freeze:** each module contributes its own sidebar entry via this mechanism, not a hand-rolled nav edit:

- `dealer_onboarding` → "Dealer Applications" (TASK-11)
- `dealer_org_rbac` → "Dealers" (TASK-12)
- `commissions` → "Commission Rules" (TASK-15)
- `payouts` → entries likely nested under the dealer detail page rather than a standalone top-level item, since payouts are always viewed per-dealer (TASK-16 to confirm placement against existing admin nav conventions when it starts)

Use i18n keys for every label (`labelKey`), never hard-coded strings, per the core module's menu-injection rule.

---

## Permission matrix

Derived directly from each module's `acl.ts` + `setup.ts`, **as currently coded** (post-TASK-02-fix state is marked separately where it differs):

| Feature | superadmin | admin | employee | dealer:owner (today) | dealer:owner (after TASK-02) | dealer:staff (today) | dealer:staff (after TASK-02) |
|---|---|---|---|---|---|---|---|
| `dealer_onboarding.admin` | ✓ | ✓ | – | – | – | – | – |
| `dealer_onboarding.view_own` | – | – | – | ✓* | ✓ | ✓* | ✓ |
| `dealer_onboarding.submit` | – | – | – | ✓* | ✓ | – | – |
| `dealer_org.admin` | ✓ | ✓ | – | – | – | – | – |
| `dealer_org.view` | – | – | – | ✓* | ✓ | ✓* | ✓ |
| `dealer_org.manage_capabilities` | – | – | – | ✓* | ✓ | – | – |
| `dealer_org.manage_staff` | – | – | – | ✓* | ✓ | – | – |
| `dealer_orders.view` / `.manage` | ✓/✓ | ✓/✓ | ✓/– | – | – | – | – |
| `dealer_orders.dealer_access` | – | – | – | **✗ (Gap 1)** | ✓ | **✗ (Gap 1)** | ✓ |
| `commissions.view` / `.manage` | ✓/✓ | ✓/✓ | ✓/– | – | – | – | – |
| `commissions.dealer_access` | – | – | – | **✗ (Gap 1)** | ✓ | **✗ (Gap 1)** | **✗ (by design — FEAT-009)** |
| `payouts.view` / `.manage` | ✓/✓ | ✓/✓ | ✓/– | – | – | – | – |
| `payouts.dealer_access` | – | – | – | **✗ (Gap 1)** | ✓ | **✗ (Gap 1)** | **✗ (by design — FEAT-009)** |

`*` = marked ✓ by `defaultRoleFeatures`, but **actually ✗ in practice for any tenant with more than one dealer**, because Gap 2 (the role-ACL replace-not-merge bug) strips these the moment a second dealer is approved, and scopes them away from any still-pending dealer. Treat the `dealer:owner (today)` column as "works only in a single-dealer tenant that has never had a second dealer approved" — which is not a realistic target state for any UI task's acceptance testing.

**No UI task may be marked Verified while its required cells above are in the "today" columns and marked ✗ or `*`.** TASK-02 must flip every `*`/✗ cell to a clean ✓ before TASK-04 through TASK-16 can be exercised with realistic (multi-dealer) test data.

---

## Package-linking approach

Verified from `apps/dealer-portal/package.json`:

```json
"dependencies": {
  "@gift/ui": "file:../../packages/ui",
  "@gift/api-client": "file:../../packages/api-client",
  "next": "16.3.8", "react": "19.3.0", "react-dom": "19.3.0"
}
```

Local `file:` protocol, no workspace/monorepo tool (no `pnpm-workspace.yaml`/turborepo config governs this linkage — each app's `package.json` points at the sibling package directory directly). **Freeze: keep this pattern.** Do not introduce a workspace manager as part of this task pack; it is a bigger architectural change than any single UI task owns, and no evidence in the repo suggests one is wanted (apps/mercato and apps/storefront do not use one either).

`packages/api-client` (`@gift/api-client`) currently exports one `request()` helper that calls `/api/om/<path>` (relative, same-origin) — **this implies the dealer-portal app itself must expose a `/api/om/[...path]` proxy route that forwards to the `apps/mercato` backend**, so that the httpOnly session cookies set by `apps/mercato`'s `/api/auth/login` are sent same-origin from the browser's perspective. **This proxy route does not exist yet** (only `layout.tsx`/`error.tsx`/`loading.tsx` exist under `apps/dealer-portal/src/app`). TASK-01 must build it. Until it exists, no dealer-portal page can make a real API call — this is a hard prerequisite for every one of TASK-04 through TASK-16, not just a nice-to-have.

The typed interfaces already stubbed in `packages/api-client/src/index.ts` (`DealerProfile`, `Capability`, `Assignment`, `Earnings`) are a reasonable starting shape but are **incomplete against the verified contracts** in API-CONTRACTS.md — e.g. `DealerProfile` omits `gstin`/`pan`/`organizationId`/`tenantId`/`reviewedBy`/`reviewedAt`/`approvedAt`; `Assignment` omits `dealerProfileId`/`tenantId`/`organizationId`/`assignedBy`. Each feature task should extend these interfaces to match the exact serialized shape documented for its endpoints in API-CONTRACTS.md rather than inventing new ad hoc types, and should add new interfaces for ledger entries and commission rules (not yet stubbed at all).

---

## Optimistic concurrency / version contract

Repo-wide convention (confirmed in `apps/mercato/AGENTS.md` and `@open-mercato/core/AGENTS.md`): "Editable records expose `updated_at`/`updatedAt`; custom update/delete clients send the version and surface 409s." **This is only half-true for Phase 2 entities as currently coded:**

| Entity | Has `updatedAt`? | Write route checks it? |
|---|---|---|
| `DealerProfile` (`dealer_onboarding`) | ✓ (verified in `data/entities.ts`) | No write route takes a version param (resubmit/approve/reject all apply unconditionally once status-gated) |
| `DealerCapability` (`dealer_org_rbac`) | ✓ (verified) | **No** — `PUT .../capabilities` is an unconditional full replace, no version check |
| `DealerOrderAssignment` (`dealer_orders`) | ✓ (verified) | **No** — status update and reassign apply unconditionally once status/paid-gated |
| `CommissionRule` (`commissions`) | **No `updatedAt` field at all** (verified in `data/entities.ts`) | N/A — rules are append-only by design (deactivate only ever sets `effectiveTo`), exempt under the core convention's own carve-out for append-only records |
| `OrderCommissionSnapshot` (`commissions`) | No | N/A — immutable snapshot, exempt |
| `DealerLedgerEntry` (`payouts`) | No | N/A — append-only ledger, exempt |

**Freeze, updated by TASK-03:** `DealerCapability` (`PUT .../dealer/profile/capabilities`, and the admin equivalent) and `DealerOrderAssignment`'s dealer status update (`POST .../dealer/orders/{id}/status`) **now have a real server-side version check**. Send the `updatedAt` you last fetched in the request body; a mismatch against the current row's `updatedAt` now returns a real `409` (`{"error":...,"code":"request_failed"}` per this doc's standard response-shape table). Sending no `updatedAt` at all keeps the prior last-write-wins behavior unchanged (backward compatible) — this is opt-in, not required, so TASK-06 and TASK-10 should send it and build a real conflict UX (reload-and-retry on 409) rather than the "no 409 path exists" placeholder this section previously described.

`DealerProfile` (`dealer_onboarding`) still has **no** version check on its writes (`resubmit`/`approve`/`reject`) — left out of TASK-03's pass because those writes are already status-gated (e.g. `approve` requires `kycStatus === 'under_review'`), which already prevents the most likely conflict shapes; a stricter `updatedAt` check there was judged lower-value for the effort and is not implemented. If a UI task's acceptance criteria require it specifically for `DealerProfile`, raise it as a follow-up — it was a deliberate scope cut, not an oversight.

---

## File ownership going forward

Mirrors — does not redesign — the lane table already in [README.md](README.md):

| Lane | Tasks | Owns |
|---|---|---|
| A | 00, 01, 02, 03, 17, 18 | Manifests/lockfiles, `packages/ui`, `packages/api-client`, global CSS, dealer-portal app shell/layout/nav, backend API/command/setup changes for all 5 modules, common test/config files |
| B | 04, 05, 06, 07 | Dealer-portal auth/session/proxy route, dealer-facing onboarding/profile/staff pages. Feature agents (C/D/E) consume B's auth contract rather than re-implementing session handling. |
| C | 08, 09, 10 | Dealer-portal dashboard/orders/order-detail pages |
| D | 11, 12, 13 | Admin backend pages for `dealer_onboarding`, `dealer_org_rbac`, `dealer_orders` — UI/widgets/translation files only; any API change request goes to lane A, not a parallel edit |
| E | 14, 15, 16 | Dealer-portal earnings page (B's auth contract) + admin backend pages for `commissions`/`payouts` — same UI-only constraint as D |

**Added by this task (not a change to the table, just making explicit what each lane's first real step is given the gaps found):**
- Lane A's TASK-02 must fix Gap 1 and Gap 2 together (see API-CONTRACTS.md) before declaring itself Ready-for-dependents; fixing Gap 1 alone would make the dealer routes reachable but still cross-dealer-leaky (Gap 3), and fixing Gap 1+3 without Gap 2 would still break any tenant with more than one dealer.
- Lane A's TASK-03 must make an explicit, recorded decision (not a silent omission) on: the assignment-history endpoint, the running-ledger-balance approach, and the staff-deactivate endpoint — each is either "added as a new backend endpoint" or "explicitly descoped for this task pack," not left ambiguous for a downstream lane to discover mid-build.
- Lane D's TASK-13 must confirm the real widget spot id on the core order admin detail page as its first step (not assume one), per the Route-groups section above.

---

## Harness / tooling prerequisite check

`apps/mercato/AGENTS.md` references `.ai/skills`, `.ai/guides`, and the `yarn mercato agentic:init --update-harness` initialization workflow. **Verified present in this checkout:** `apps/mercato/.ai/guides/` (contains `contracts.md`, `backend-ui.md`, `framework-contracts.md`, `architecture.md`-adjacent facts, `upstream/BACKWARD_COMPATIBILITY.md`, etc.) and `apps/mercato/.ai/skills/` (contains `om-module-scaffold`, `om-backend-ui-design`, `om-data-model-design`, and the rest of the referenced skill set). **No missing-harness blocker exists in this checkout** — the README's note that these were missing is stale as of this audit; `.ai/guides` was merged in before this task started, per the task prompt's own note, and this audit confirms it with a directory listing, not just the prompt's say-so.

No installation or initialization was run as part of this audit (planning-only task; "do not install or initialize tools merely to read this planning pack" per README's conflict-avoidance rules).

---

## Baseline verification run (this audit, read-only)

```
$ cd apps/mercato && yarn jest src/modules/dealer_onboarding src/modules/dealer_org_rbac src/modules/dealer_orders src/modules/commissions src/modules/payouts --silent
Test Suites: 11 passed, 11 total
Tests:       267 passed, 267 total
Time:        12.392 s
```

Matches `docs/phase-2-status.md`'s recorded baseline exactly — no drift since that document was written. **No new test failures were introduced by this audit** (no application code was touched). The 267 passing tests do not exercise Gap 1 or Gap 2 — both are integration-level ACL interactions across `dealer_onboarding`'s command and the shared `@open-mercato/core` auth commands, invisible to unit tests that mock the command bus. This is noted explicitly so TASK-02 does not mistake "267/267 green" for "the ACL wiring is correct" — it is exactly the gap this audit found.

`git status` at the start of this audit: clean except pre-existing untracked `apps/mobile/` (unrelated to Phase 2 UI, not touched by this task).
