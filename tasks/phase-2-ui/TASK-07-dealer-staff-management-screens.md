# P2-UI-07: Dealer staff management screens

- Status: Review; implementation complete
- Owner lane: B
- Depends on: P2-UI-01, P2-UI-03, P2-UI-04
- Owned paths: apps/dealer-portal/src/app/(portal)/staff/; src/components/staff/; src/lib/features/staff/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [x] Create owner-only staff list, invitation and deactivation UX using verified lifecycle endpoints.
- [x] Show actual invite/member states and delivery errors without inventing resend support.
- [x] Confirm deactivation and explain loss of access; protect owner and current-user cases.

## Acceptance and verification

- [x] Owner invites a user, invitation can be activated, list refreshes and deactivation removes access.
- [x] Staff cannot invoke management APIs or access management routes.
- [x] Duplicate email, failed invitation and empty list states handled.
- [x] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [x] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Review; implementation complete, no backend changes made (this task is UI-only, consuming the already-implemented P2-UI-03 endpoints).

- Changed files:
  - `apps/dealer-portal/src/lib/features/staff/types.ts` — `DealerStaffMember`/`StaffListResponse`/invite-deactivate response types, verified against the real `dealerStaffMemberWireSchema`/`staffListResponseSchema`/etc. in `apps/mercato/src/modules/dealer_org_rbac/api/openapi.ts`.
  - `apps/dealer-portal/src/lib/features/staff/validators.ts` — pure invite-form validation mirroring the real `staffInviteSchema` (`.strict()`, email max 255, optional name 1-255) + `buildInvitePayload`/`mergeFieldErrors`.
  - `apps/dealer-portal/src/lib/features/staff/roster.ts` — pure `canDeactivate`/`isOwner`/`splitRoster` helpers.
  - `apps/dealer-portal/src/lib/features/staff/errors.ts` — `mapStaffInviteError`/`mapStaffDeactivateError` classifiers, including a `duplicate_email` kind detected from the real wire-level message (see "Verified contracts" below for why `details`/`code` can't be used for this one).
  - `apps/dealer-portal/src/lib/features/staff/api.ts` — `fetchStaffRoster`/`inviteStaffMember`/`deactivateStaffMember` over the BFF proxy (`@gift/api-client`'s `request`).
  - `apps/dealer-portal/src/app/(portal)/staff/page.tsx` — owner-only page (`requireRole(['dealer:owner'])`).
  - `apps/dealer-portal/src/components/staff/StaffListView.tsx`, `StaffTable.tsx`, `OwnerCard.tsx`, `StaffBadges.tsx`, `InviteStaffDialog.tsx`, `DeactivateStaffDialog.tsx` — the actual UI: owner card (read-only), staff table with a real Active/Deactivated badge, an invite dialog, and a deactivate confirmation dialog that explains the real `isConfirmed:false` consequence.
  - New tests: `apps/dealer-portal/tests/staff-validators.test.mjs`, `staff-errors.test.mjs`, `staff-roster.test.mjs`, `staff-acl-contract.test.mjs` (the last reads the real `apps/mercato/src/modules/dealer_org_rbac` route/setup/command source directly, mirroring `tests/profile-acl-contract.test.mjs`'s pattern).
  - `tasks/phase-2-ui/TASK-07-dealer-staff-management-screens.md` (this file), `tasks/phase-2-ui/README.md` (status Planned → Review).
  - Nothing touched outside these paths: `src/lib/auth/`, `app/api/om/`, `components/auth/`, `(auth)/`, and `src/lib/http/allowlist.ts` were only read/imported from (the three staff routes were already allowlisted before this task started, confirmed by reading `allowlist.ts` directly — no edit needed). `components/layout/nav-items.ts` already had the owner-only `/staff` entry from TASK-01 — not touched.

- Verified contracts (all read directly from source, not assumed):
  - `GET .../dealer/staff`, `POST .../dealer/staff/invite`, `POST .../dealer/staff/{id}/deactivate` all require `dealer_org.manage_staff`, granted only to `dealer:owner` in `dealer_org_rbac/setup.ts` — pinned in `tests/staff-acl-contract.test.mjs`.
  - `executeStaffDeactivate` (`commands/staff.ts`) rejects self-deactivation unconditionally before touching the auth module, and resolves its target exclusively via `findDealerStaffUser` (`lib/staffDirectory.ts`), which only ever matches a `dealer:staff` row — never `dealer:owner`. Because the `/staff` page itself is owner-only, this means "hide Deactivate on an owner row" (`roster.ts`'s `canDeactivate`) is provably equivalent to "hide Deactivate on the caller's own row," without needing a client-visible "my own user id" (this app's `GET /api/auth/profile` returns only `email`/`name`/`roles`, never `id` — verified in `lib/auth/backend.ts`). This is a stronger guarantee than an id-comparison alone, since it also correctly hides Deactivate on a hypothetical second owner's row (which would 404 server-side regardless).
  - Deactivation is a real access revocation: `auth.users.update` with `isConfirmed:false`, the same flag the auth module's session-integrity check and login route enforce (confirmed in `@open-mercato/core/modules/auth/commands/users.ts` and the backend module's own doc comments). The confirmation dialog's copy states this plainly.
  - The real invite/member states are exactly two: Active / Deactivated (`isConfirmed`). There is no third "invited, pending password setup" state on the wire — `auth.users.create` sets `isConfirmed:true` at creation regardless of `sendInviteEmail`. The UI does not invent one, and does not add a "resend invite" button (no such dealer-facing endpoint exists; the core auth module's `api/users/resend-invite` is a separate, non-allowlisted, non-dealer-facing admin route).
  - Duplicate-email handling: `auth.users.create`'s `throwDuplicateEmailError()` throws a `CrudHttpError(400, { error: 'Email already in use', fieldErrors, details })`, but the shared `dealerHandler` wrapper (`dealer_onboarding/lib/http.ts`) only forwards `status`/`code`/`message` for `CrudHttpError` — not `fieldErrors`/`details` (confirmed by reading that file; only its separate `ZodError` branch builds a `details` extra). So the real wire response for duplicate email has no machine-readable field marker at all — `errors.ts`'s `mapStaffInviteError` detects it from the real message text (`/already in use/i`) rather than a non-existent code, and this is covered by a test using that exact real string, not a guess.
  - **Found backend bug, outside every path this task owns, flagged as a follow-up (not fixed here):** `executeStaffInvite` (`dealer_org_rbac/commands/staff.ts`) does `const { result } = await commandBus.execute('auth.users.create', ...); return { userId: result.id, email: parsed.email }`. The real `auth.users.create` handler returns `{ user: User, warning? }` (verified in `@open-mercato/core/modules/auth/commands/users.ts`), which has no top-level `id` — so `result.id` is `undefined`, and the real `POST .../dealer/staff/invite` response body omits `userId` entirely (`JSON.stringify` drops the `undefined` key), contrary to its own documented `staffInviteResponseSchema`. There is also no unit test for `executeStaffInvite` in `dealer_org_rbac/__tests__/` (only `staffDeactivate.commands.test.ts` and `staffDirectory.test.ts` exist), so this was previously unverified. **Worked around, not just noted:** this app's `InviteStaffDialog` never reads `userId` off the invite response — on success it only reads back the `email` it itself submitted for the toast, and always refetches the real roster (same discipline as `CapabilitiesEditView`), so this bug cannot surface as a UI defect here. Recommend lane A/TASK-03's owning agent fix `commands/staff.ts` to read `result.user.id` and forward `result.warning` so a future task could surface delivery failures honestly (today, "the invite email failed to send" is invisible to every dealer-facing caller — this app's "failed invitation send" state is therefore only the POST itself failing, which is the most the real contract can report).
  - **Pre-existing, previously-flagged gap, not introduced by this task:** the invite email's set-password link is built by `auth.users.create`'s `sendInviteToUser` from `getSecurityEmailBaseUrl()` (`APP_URL`, apps/mercato's own base), so a real dealer-staff invite email links to apps/mercato's `/reset/[token]`, not this app's own `(auth)/reset/[token]` page — this app's own page's doc comment (written by P2-UI-04) already documents this exact gap for the dealer-registration path; this task confirms it applies identically to staff invites, since both go through the same `auth.users.create`/`sendInviteToUser` path. The underlying token/password-setup MECHANISM is real and shared with the forgot-password flow (not fixable from any path this task owns — it lives in the published `@open-mercato/core` package); only the email's link target app is wrong. A newly-invited staff member can still complete password setup (on the mercato app's reset page) and then sign in at the dealer-portal normally — the account is not unusable, just inconvenient to activate.

- Commands and results:
  - `cd apps/dealer-portal && npm run test` — before: 267 passed, 0 failed. After adding this task's 4 new test files: **300 passed, 0 failed** (33 new tests: 8 validators, 11 error-classifier, 6 roster, 8 ACL-contract-against-real-mercato-source).
  - `cd apps/dealer-portal && npm run typecheck` — clean (no errors).
  - `cd apps/dealer-portal && npm run lint` — 0 errors, 2 pre-existing warnings in `components/auth/` (outside this task's owned paths, not introduced here).
  - `cd apps/dealer-portal && npm run build` — succeeds; `/staff` appears in the route manifest as a dynamic (`ƒ`) route alongside `/profile`, `/profile/capabilities`, etc.
  - No live backend/database/mailer was available in this sandbox (same constraint every other P2-UI task's handoff documents, e.g. `tests/profile-acl-contract.test.mjs`'s own header comment) — "owner invites a user, the invitation can genuinely be activated" was verified by reading the real command/route source end to end (invite → `auth.users.create` with `sendInviteEmail:true` → `PasswordReset` token → the shared reset/password-setup flow already built and tested by P2-UI-04) rather than by firing a real HTTP request. The one real gap found in that chain (the email's link target app) is documented above, not glossed over.

- Blockers or follow-up tasks:
  1. (Backend, outside this task's owned paths) Fix `executeStaffInvite`'s `result.id` → `result.user.id` bug and forward `result.warning` so the invite response matches its own documented schema and so "the invite email failed to send" becomes a real, reportable state. This app's UI already tolerates the bug (never reads `userId` off the response), so this is not a blocker for this task's own acceptance, only a correctness gap worth fixing at the source.
  2. (Backend, outside every owned path — lives in `@open-mercato/core`) Thread a portal-aware base URL (`DEALER_PORTAL_BASE_URL`, already used correctly by the KYC notification emails per P2-UI-04's own doc comment) through `auth.users.create`'s invite-email link, so a dealer-staff invite lands the new staff member on the dealer-portal's own `/reset/[token]` page instead of apps/mercato's.
  3. TASK-17 (integration) should exercise the real invite → email link → password setup → dealer-portal login → staff-list-refresh → deactivation → re-login-blocked round trip against a live backend, since this sandbox has none.

- Ready for dependent tasks: Yes — this is the last Lane B task; nothing in Lane C/D/E depends on `/staff` specifically, and the two follow-ups above are backend-owned, non-blocking corrections, not missing functionality in this task's own owned paths.
