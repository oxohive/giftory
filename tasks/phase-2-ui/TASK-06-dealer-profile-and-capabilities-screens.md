# P2-UI-06: Dealer profile and capabilities screens

- Status: Planned; implementation not started
- Owner lane: B
- Depends on: P2-UI-01, P2-UI-03, P2-UI-04
- Owned paths: apps/dealer-portal/src/app/(portal)/profile/; src/components/profile/; src/lib/features/profile/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [x] Show business profile and editable production capabilities for owners.
- [x] Use API enums for printing methods, product types, serviceable states, capacity and minimum quantities.
- [x] Handle unsaved changes, validation, mutation refresh and concurrency conflicts when supported.
- [x] Do not offer unsupported business identity editing.

## Acceptance and verification

- [x] Owner can save and reload real capabilities; staff cannot mutate via direct requests.
- [x] Empty/invalid capacity, state/method codes and failed save states are covered.
- [x] Shared files and nav changes delivered to lane A — none needed; allowlist and nav-items were already correct for this task (see handoff).
- [x] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [x] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Implementation complete. All Work and Acceptance items addressed within owned paths. Full apps/dealer-portal test suite green before and after; no regressions.

- Changed files:
  - `apps/dealer-portal/src/app/(portal)/profile/page.tsx` (new) — `/profile`: read-only business profile + read-only capabilities summary, visible to both roles.
  - `apps/dealer-portal/src/app/(portal)/profile/capabilities/page.tsx` (new) — `/profile/capabilities`: the one editable surface, `requireRole(['dealer:owner'])`.
  - `apps/dealer-portal/src/components/profile/ProfileView.tsx` (new) — `/profile`'s client view: fetch, loading/error/401/403 states, composes the two cards below.
  - `apps/dealer-portal/src/components/profile/BusinessProfileCard.tsx` (new) — read-only identity-field display only (no editor).
  - `apps/dealer-portal/src/components/profile/CapabilitiesSummaryCard.tsx` (new) — read-only capabilities display for both roles; owner-only "Edit capabilities" link.
  - `apps/dealer-portal/src/components/profile/CapabilitiesEditView.tsx` (new) — `/profile/capabilities`'s client view: fetch, form state, validation, submit, refetch-after-save, 409/422/403/404/network handling, unsaved-changes guard wiring.
  - `apps/dealer-portal/src/components/profile/CapabilitiesForm.tsx` (new) — the controlled form fields (presentational only).
  - `apps/dealer-portal/src/components/profile/ProductTypeTagsInput.tsx` (new) — open free-text tag input for `productTypeCodes`.
  - `apps/dealer-portal/src/components/profile/MultiSelectCheckboxGroup.tsx` (new) — closed-enum checkbox grid for `printingMethods`/`serviceableStates`.
  - `apps/dealer-portal/src/components/profile/useUnsavedChangesGuard.ts` (new) — `beforeunload` + capture-phase anchor-click interception while the capabilities form is dirty.
  - `apps/dealer-portal/src/lib/features/profile/{types,constants,api,validators,errors,navigationGuard}.ts` (new) — types; real `PRINTING_METHODS`/`INDIAN_STATE_CODES` enums (copied verbatim from the backend module); fetch/save calls; pure field validation + payload builder + dirty-check mirroring the real `capabilitiesUpsertSchema` bounds; error classifier; pure navigation-intercept decision logic.
  - `apps/dealer-portal/tests/profile-{validators,errors,navigation-guard,acl-contract,no-identity-edit}.test.mjs` (new).
  - `tasks/phase-2-ui/README.md` — P2-UI-06 row `Planned` → `Review`.
  - `tasks/phase-2-ui/TASK-06-dealer-profile-and-capabilities-screens.md` — this file.
  - No changes to `apps/dealer-portal/src/lib/http/allowlist.ts` — both required paths (`dealer_org_rbac/dealer/profile` GET, `dealer_org_rbac/dealer/profile/capabilities` PUT) were already present (checked `git status`/the file directly before writing anything; confirmed again by the pre-existing `tests/allowlist.test.mjs`, which already asserted both). No changes to `components/layout/nav-items.ts` either — `/profile` was already listed with no role restriction, which turned out to be the correct shape (see permission-matrix note below), so no lane-A change was needed.

- Verified contracts (read directly from `apps/mercato/src/modules/dealer_org_rbac/{data/validators.ts,lib/constants.ts,commands/{shared,capabilities}.ts,api/dealer/profile/**,setup.ts,acl.ts}`, not guessed):
  - `GET /api/dealer_org_rbac/dealer/profile` — requires only `dealer_org.view`; returns `serializeDealerProfile(profile)` (identity fields, `gstin`/`pan` never included) spread with `capabilities: serializeCapabilities(cap)` (`id?`, `productTypeCodes`, `printingMethods`, `maxDailyCapacity`, `serviceableStates`, `minOrderQty`, `updatedAt` — `null`, never omitted, when no capability row exists yet). 404 `dealer_org.errors.dealerNotFound` when no approved profile.
  - `PUT /api/dealer_org_rbac/dealer/profile/capabilities` — requires `dealer_org.manage_capabilities`; `.strict()` body, every field optional via `.default(...)` (`productTypeCodes` ≤100 items/100 chars each, free text, no enum; `printingMethods` ⊆ the real 5-value `PRINTING_METHODS`; `maxDailyCapacity` int 0–100000; `serviceableStates` ⊆ the real 37-value `INDIAN_STATE_CODES`; `minOrderQty` int 1–10000; optional `updatedAt` ISO datetime for optimistic concurrency). Real **409** on `updatedAt` mismatch (`commands/capabilities.ts`'s `conflict(...)`, only enforced when the client actually sends `updatedAt` — this UI always does once it has fetched a value). 400 "dealer must be approved" / 404 no profile from the same `findOwnProfile` guard the GET route uses.
  - **Permission-matrix reconciliation (the one real ambiguity found in CONTRACT-HANDOFF.md):** its "Route groups" table lists `/profile`'s role informally as "owner", but its own separate "Permission matrix" section — the section this task's briefing explicitly points at for this question — shows `dealer_org.view` granted to BOTH `dealer:owner` and `dealer:staff` (confirmed directly in `setup.ts`: `DEALER_STAFF_ROLE: [FEAT_DEALER_ORG_VIEW]`), with only `dealer_org.manage_capabilities` owner-only. Built accordingly: `/profile` uses `requireApprovedDealer()` (both roles), `/profile/capabilities` uses `requireRole(['dealer:owner'])`. This also matches the already-committed `CapacityCard.tsx`'s own comment ("staff see the same read state with no edit affordance") and `nav-items.ts` already listing `/profile` with no `rolesAllowed` restriction — both are lane A/C work that would have been inconsistent with an owner-only `/profile`.
  - Confirmed `dealer_org_rbac.productTypeCodes` has no canonical enum anywhere in the schema (re-verified directly, consistent with P2-UI-12's own documented finding) — rendered as an open free-text tag field (`ProductTypeTagsInput`), never a dropdown. `printingMethods`/`serviceableStates` ARE real closed enums — rendered as checkbox grids sourced from this app's own copy of `PRINTING_METHODS`/`INDIAN_STATE_CODES` (verbatim from the backend module), mirroring the admin editor's (`dealer_org_rbac/components/CapabilitiesForm.tsx`, P2-UI-12) `allowCustomValues` convention for the same split, adapted to this app's own `@gift/ui` primitives (no shared `TagsInput` exists in `@gift/ui`; `@open-mercato/ui`'s is not a dependency of this app).

- Commands and results:
  - Baseline (before this task's changes, captured at task start): `cd apps/dealer-portal && node --test tests/*.test.mjs` → **200/200 passed, 21 files, 0 failed.**
  - After this task's changes: `cd apps/dealer-portal && node --test tests/*.test.mjs` → **267/267 passed, 29 files, 0 failed.** Net +67 tests / +8 files since baseline; this task's own contribution is +39 tests across 5 new files (`profile-validators.test.mjs` 14, `profile-errors.test.mjs` 7, `profile-navigation-guard.test.mjs` 7, `profile-acl-contract.test.mjs` 5, `profile-no-identity-edit.test.mjs` 6). The remaining +28 tests / +2 files (`order-detail-data.test.mjs`, `order-detail-isolation.test.mjs`) landed from a concurrently running sibling lane (C, orders/order-detail) in this same checkout during this task's work, not from this task — confirmed by diffing the file list, not assumed.
  - `npx tsc --noEmit` — 0 errors, both before and after.
  - `npx eslint .` (app-wide) — 0 errors; 2 pre-existing warnings, both in `components/auth/` (`LogoutButton.tsx`, `ResetPasswordForm.tsx` — lane B's own prior task, not touched by this one), unrelated to this task's files.
  - `npx next build` — succeeds; `/profile` and `/profile/capabilities` both register as dynamic (`ƒ`) server routes alongside every other portal route.

- Blockers or follow-up tasks:
  - **Staff-cannot-mutate verification is source-level, not a live HTTP request.** This sandbox has no running `apps/mercato` backend/database to fire a real request against (the same constraint every other P2-UI task's handoff documents). `profile-acl-contract.test.mjs` pins the real enforcement boundary by reading `apps/mercato/src/modules/dealer_org_rbac`'s actual route metadata and `setup.ts` directly (not a UI mock): the PUT route requires `dealer_org.manage_capabilities`; `setup.ts` grants that feature to `dealer:owner` only, never `dealer:staff`. Combined with `profile-no-identity-edit.test.mjs`'s static scan (exactly one file in this task's owned surface issues a mutating request, and it's a PUT to the capabilities path only), this establishes that even a bypassed/hidden-nav UI has no code path that would attempt the mutation as staff, AND that the server itself would 403 it if attempted. TASK-17's integration pass should still exercise this with a real authenticated request against a running backend, per its own remit.
  - No RTL/jsdom component-mount tests were added, consistent with this app's own established precedent (every existing `*.test.mjs` in `tests/` is a pure-logic or static-source-scan test; no jsdom is configured) and with P2-UI-12's identical choice for the equivalent admin screen. `useUnsavedChangesGuard.ts`'s DOM-touching wiring is therefore not directly unit-tested; the one piece of real decision logic inside it (`shouldInterceptNavigation`) is pulled out into `navigationGuard.ts` and is fully covered by `profile-navigation-guard.test.mjs`. Live/browser verification of the rendered pages (including the unsaved-changes browser prompt itself) was not performed in this sandbox (no running dev server or database) — flagging for TASK-17.
  - The unsaved-changes guard intercepts in-app same-origin anchor clicks application-wide while `/profile/capabilities` is dirty (covers `PortalNav`, the page's own "Cancel"/"your profile" links) plus the native `beforeunload` prompt for tab close/refresh/typed-URL navigation. It does not intercept the browser back/forward buttons (`popstate`) — a deliberate scope cut given the added complexity of reliably intercepting that in the App Router without a dedicated router-navigation-blocking API in this Next.js version; flagging as a known gap rather than a silent omission.
  - Did not modify `components/layout/nav-items.ts` or `src/lib/http/allowlist.ts` — both already had exactly what this task needed (confirmed by reading them before writing any code, and by this task's own tests passing against them unmodified).

- Ready for dependent tasks: Yes.
