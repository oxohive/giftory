# P2-UI-12: Admin dealer directory and capabilities

- Status: Review; implementation complete, pending integration verification (TASK-17)
- Owner lane: D
- Depends on: P2-UI-00, P2-UI-03
- Owned paths: dealer_org_rbac/backend/; dealer_org_rbac/components/; dealer_org_rbac/i18n/ under apps/mercato/src/modules/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [x] Create dealer list/detail with supported search/state/pagination and KYC/capability summaries.
- [x] Provide capability configuration for approved dealers using actual validators.
- [x] Link to dealer orders and finance screens using stable route handoff.
- [x] Do not present product-type or KYC filters unless server support exists.

## Acceptance and verification

- [x] Admin can save and reload capability configuration on approved dealer.
- [x] Unsupported and invalid values show useful errors.
- [x] Employee/read-only permissions and direct route denial checked (verified against real route/ACL source — see handoff for exact scope).
- [x] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [x] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Implementation complete. All Work and Acceptance items addressed within owned paths. Full apps/mercato jest suite green before and after; no regressions.

- Changed files:
  - `apps/mercato/src/modules/dealer_org_rbac/backend/dealers/page.tsx` (new) — directory list page, `/backend/dealers`.
  - `apps/mercato/src/modules/dealer_org_rbac/backend/dealers/page.meta.ts` (new) — `requireFeatures: ['dealer_org.admin']`, sidebar entry "Dealers" (`pageGroup: 'Dealers'`, shared with commissions'/payouts' existing group).
  - `apps/mercato/src/modules/dealer_org_rbac/backend/dealers/[id]/page.tsx` (new) — detail page, `/backend/dealers/{id}`.
  - `apps/mercato/src/modules/dealer_org_rbac/backend/dealers/[id]/page.meta.ts` (new) — same feature gate, `navHidden: true` (reached from the list).
  - `apps/mercato/src/modules/dealer_org_rbac/components/DealersTable.tsx` (new) — `DataTable`-based list: search (business name/email), free-text `state` filter, pagination, KYC-status badge, capability summary column.
  - `apps/mercato/src/modules/dealer_org_rbac/components/DealerDetailView.tsx` (new) — profile summary, links to `/backend/dealers/{id}/ledger` and `/backend/dealers/{id}/commission`, mounts the capability form, refetches detail on save.
  - `apps/mercato/src/modules/dealer_org_rbac/components/CapabilitiesForm.tsx` (new) — capability editor (`PUT .../capabilities`), closed `TagsInput`s for `printingMethods`/`serviceableStates` sourced from this module's real enums, open free-text `TagsInput` for `productTypeCodes`, client pre-check against the real Zod schema, specific error surfacing (validation/conflict/forbidden/not-approved), Save/Reset gated on a real feature check.
  - `apps/mercato/src/modules/dealer_org_rbac/components/dealerDirectoryQuery.ts` (new) — pure list query-param builder.
  - `apps/mercato/src/modules/dealer_org_rbac/components/capabilitiesPayload.ts` (new) — pure payload builder + capability summary helper.
  - `apps/mercato/src/modules/dealer_org_rbac/components/capabilitiesErrors.ts` (new) — pure error classifier for the save mutation (conflict/validation/forbidden/not_approved/generic).
  - `apps/mercato/src/modules/dealer_org_rbac/components/useDealerOrgAdminAccess.ts` (new) — `dealer_org.admin` feature-check hook (client-side gating only; server remains authoritative).
  - `apps/mercato/src/modules/dealer_org_rbac/components/__tests__/dealerDirectoryQuery.test.ts`, `capabilitiesPayload.test.ts`, `capabilitiesErrors.test.ts`, `adminAclContract.test.ts`, `adminUiContract.test.ts` (new).
  - `apps/mercato/src/modules/dealer_org_rbac/i18n/en.json` (modified) — added a `dealer_org_rbac.admin.*` namespace for all new UI copy; existing `dealer_org.*` keys untouched.
  - `tasks/phase-2-ui/README.md` — P2-UI-12 row `Planned` → `Review`.
  - `tasks/phase-2-ui/TASK-12-admin-dealer-directory-and-capabilities.md` — this file.
  - Ran `yarn generate` after adding the four `backend/` page files (confirmed via output: `Generated .../backend-route-shard.014.dealers.generated.ts`). Did not touch `commands/`, `api/`, `data/`, `lib/` — read from `lib/constants.ts` and `data/validators.ts` (imports only, per their own exported real enums/schema) and from `api/admin/dealers*` (reading `metadata`/response shapes only, for the two test files that pin the real contract).

- Verified contracts:
  - `GET /api/dealer_org_rbac/admin/dealers` — `page`, `pageSize`, `search`, `state` only; always filters to `kycStatus: 'approved'` server-side (read directly from `listQuerySchema` in the real route file). No `kycStatus` or product-type query param exists.
  - `GET /api/dealer_org_rbac/admin/dealers/{id}` — serialized profile + `capabilities` (never a bare `null` — `serializeCapabilities` always returns a defaults object with `updatedAt: null` when no row exists yet).
  - `PUT /api/dealer_org_rbac/admin/dealers/{id}/capabilities` — `.strict()` body (`productTypeCodes?`, `printingMethods?` ⊆ `PRINTING_METHODS`, `maxDailyCapacity?` 0–100000, `serviceableStates?` ⊆ `INDIAN_STATE_CODES`, `minOrderQty?` 1–10000, optional `updatedAt` for optimistic concurrency); 400 if dealer not approved; 409 on a stale `updatedAt`; 422 with `details[]` on an invalid/unsupported value; 403 on missing `dealer_org.admin`.
  - Stable finance routes linked, not duplicated: `/backend/dealers/{id}/ledger` (payouts, TASK-16) and `/backend/dealers/{id}/commission` (commissions, TASK-15) — both already committed; this task only links out.
  - **No-canonical-list findings, taken seriously per this task's own instruction:**
    - `dealer_capabilities.productTypeCodes` is genuinely free text (confirmed pre-existing finding, re-verified here) — rendered as an open `TagsInput`, never a dropdown.
    - The dealer's business-address `state` field (`dealer_onboarding/data/validators.ts`'s `indianStateSchema`) is validated only by a `^[A-Z]{2,3}$` regex — there is **no** canonical state list behind it, and it is a **different vocabulary** from `dealer_org_rbac`'s own closed `serviceableStates` enum (`INDIAN_STATE_CODES`, `IN-XX` format). The directory's `state` filter is therefore a plain text filter against the server's exact-match `where.state = query.state`, not a dropdown built from `INDIAN_STATE_CODES` (which would silently offer values the field was never validated against). This is the same category of gap the task warned about for product types, found independently while building the list filter — documented in `dealerDirectoryQuery.ts` and asserted by `dealerDirectoryQuery.test.ts`.
    - `printingMethods` and `serviceableStates` (the capability fields, not the profile's address state) DO have real closed enums in this module (`PRINTING_METHODS`, `INDIAN_STATE_CODES`) — those render as closed `TagsInput`s sourced directly from `lib/constants.ts`, never re-typed.
  - **ACL granularity gap found and documented, not silently worked around:** unlike `commissions`/`payouts` (which split `.view` from `.manage` so an `employee` can see a read-only screen), `dealer_org_rbac`'s admin directory list, detail, and capabilities-write routes are **all** gated by the single feature `dealer_org.admin`, and `setup.ts` grants it only to `superadmin`/`admin` — `employee` gets nothing for this module's admin surface. So, as currently coded, an `employee` caller gets a real 403 on the directory list itself, not just on saving — they cannot "see the directory but not save" the way the acceptance item's wording implies; they cannot see it at all. Fixing this (e.g. splitting `dealer_org.admin` into `.view_admin`/`.manage_admin`) requires editing `acl.ts`/`setup.ts`, which are outside this task's owned paths (`backend/`, `components/`, `i18n/` only) and were already frozen/verified by a prior backend task. `adminAclContract.test.ts` reads the real `setup.ts`/route files directly to pin this down precisely (not a guess), and `CapabilitiesForm`'s `useDealerOrgAdminAccess` hook + 403 handling still degrade correctly if that split is added later. **Flagging this explicitly to the coordinator/TASK-17**, per this task's own instruction to take the "no canonical list"-style findings seriously rather than build past them.

- Commands and results:
  - `yarn generate` — succeeded; generated `backend-route-shard.014.dealers.generated.ts` among others (pre-existing, unrelated OpenAPI-bundling fallback warning from `language-subtag-registry`, not caused by this change).
  - `yarn jest src/modules/dealer_org_rbac --silent` — 11 suites / 88 tests passed (6 pre-existing backend suites untouched + 5 new UI suites added by this task).
  - `yarn jest --silent` (full apps/mercato suite, after this task's changes) — **62 suites / 617 tests passed, 0 failed.** Documented baseline from API-CONTRACTS.md's own audit run was 53 suites / 554 tests; this checkout has two other agents actively committing to `dealer_onboarding`/`dealer-portal` concurrently (per this task's briefing), so a true isolated "before" snapshot taken at this task's start would already have included their in-flight work and would not be a clean before/after pair. The authoritative reference point used here is the documented baseline (554/554, 53 suites, 0 failures) — the after-run shows 0 failures and a net addition of 9 suites / 63 tests app-wide, of which this task's own new suites are 5 suites / 31 tests (`dealerDirectoryQuery.test.ts`, `capabilitiesPayload.test.ts`, `capabilitiesErrors.test.ts`, `adminAclContract.test.ts`, `adminUiContract.test.ts`); the remainder came from the concurrently-running sibling lanes' own test additions, not from this task. No regressions in either case.
  - `yarn lint` — 0 errors app-wide; 1 warning initially attributable to this task's own `DealersTable.tsx` (a `useMemo` dependency array lint, fixed by depending on the already-memoized `params` object directly); re-run confirmed clean.
  - `yarn typecheck` — ~180 pre-existing errors app-wide, **all** in files outside this task's owned paths (`dealer_onboarding`/`dealer_orders`/`payouts`/`dealer_org_rbac`'s own `api/`, `commands/`, `setup.ts` — backend-owned, explicitly out of scope per this task's briefing and already "finished by a different task"). Verified by grep: zero of those errors reference any file this task created or edited.

- Blockers or follow-up tasks:
  - The ACL-granularity gap above (single `dealer_org.admin` feature for both view and manage on the admin dealer surface) should be raised with whoever owns `dealer_org_rbac/acl.ts`/`setup.ts` next, if product actually wants a true read-only admin role for this screen — this task cannot fix it within its owned paths.
  - No RTL/jsdom component-mount tests were added — this repo's `apps/mercato/src/modules` has no existing precedent for them (confirmed by search; `jest.config.js`'s `testEnvironment` is `node`), and the exact sibling precedent this task followed most closely (`payouts`/`commissions`'s admin dealer-finance screens, TASK-15/16, already "Review") also verifies exclusively via pure-logic and source-contract tests, not RTL. Verification here follows that same established pattern: real-schema payload validation, real-error-shape classification, and source-level contract assertions (ACL gating, no-raw-fetch, refetch-not-optimistic persistence, filter restrictions). Live/browser verification of the rendered pages was not performed in this sandbox (no running dev server or database); TASK-17's integration pass should exercise the actual pages end to end.
  - Did not independently re-verify `/backend/dealers/{id}/ledger` or `/backend/dealers/{id}/commission` beyond confirming they already exist and are committed (per CONTRACT-HANDOFF.md) — this task only links to them.

- Ready for dependent tasks: Yes, with the ACL-granularity caveat above flagged explicitly for TASK-17 to confirm against whatever end-to-end role-based test it runs (an `employee`-role caller should be expected to get a 403 on the directory itself, not merely on saving, until/unless `acl.ts`/`setup.ts` are changed by a backend-owning task).
