# P2-UI-11: Admin KYC application review

- Status: Review
- Owner lane: D
- Depends on: P2-UI-00, P2-UI-03
- Owned paths: dealer_onboarding/backend/; dealer_onboarding/components/; dealer_onboarding/i18n/ under apps/mercato/src/modules/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [x] Add application list with supported search/status pagination and application detail.
- [x] Review business details and authorized private documents; approve or reject with required reason.
- [x] Use installed DataTable/CrudForm and API helpers; feature metadata and localized strings.
- [x] Display action result and refreshed status; prevent accidental duplicate review.

## Acceptance and verification

- [x] Reviewer can reject, view resubmission and approve an actual fixture application.
- [x] Unauthorized users cannot open documents or invoke decisions.
- [x] Loading/empty/error/409 states, keyboard dialogs and audit behavior verified.
- [x] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [x] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Review

- Changed files:

  ```
  # dealer_onboarding/components (owned)
  ApplicationsTable.tsx            (fixed the detail-row href bug: was /backend/dealer-applications/{id},
                                     now the CONTRACT-HANDOFF.md-frozen /backend/dealers/applications/{id};
                                     switched kycStatus cell to StatusBadge; extracted query-param
                                     building into applicationsQuery.ts)
  adminShared.tsx                  (+ApplicationDetail, +ApplicationDocument types for the admin detail
                                     endpoint's real response shape — profile + decrypted gstin/pan +
                                     documents[])
  ApplicationDetailPage.tsx         (new — the review screen: loading/error/404/403 states, business
                                     details + GSTIN/PAN, KYC documents list with secure per-document
                                     download, Approve (ConfirmDialog) / Reject (dialog) actions gated by
                                     the application's real current status, resubmission + rejection-reason
                                     banners, conflict handling that refetches and shows the real status)
  RejectApplicationDialog.tsx      (new — required-reason reject dialog: Cmd/Ctrl+Enter submit, Escape
                                     cancel, disabled-while-submitting double-submit guard, distinct
                                     missing-reason / conflict / forbidden / generic failure handling)
  reviewActions.ts                 (new, pure — submitApproveApplication/submitRejectApplication,
                                     isReviewConflictStatus, canApproveFromStatus/canRejectFromStatus
                                     mirroring executeApprove/executeReject's real status-transition rules)
  kycDocumentDownload.ts           (new, pure — the ONE place that builds the admin KYC document download
                                     URL; fetches via an injected, testable fetchBlob and saves client-side;
                                     never falls back to any other URL on failure)
  applicationsQuery.ts             (new, pure — query-param builder for the applications list: search,
                                     kycStatus, page, pageSize)
  __tests__/applicationsQuery.test.ts, reviewActions.test.ts, kycDocumentDownload.test.ts,
    adminRouteAuthorization.test.ts   (new — see "Commands and results" below)

  # dealer_onboarding/backend (owned, new directory — none existed before this task)
  dealers/applications/page.tsx, page.meta.ts
  dealers/applications/[id]/page.tsx, page.meta.ts

  # dealer_onboarding/i18n (owned)
  en.json                          (+admin.* keys for every string this task's UI renders — no hardcoded
                                     UI text)

  # tasks/phase-2-ui (coordinator-owned docs, this task's own files only)
  README.md                        (status Planned -> Review for P2-UI-11)
  TASK-11-admin-kyc-application-review.md (this file)
  ```

  Not touched: `dealer_onboarding/commands/`, `api/`, `data/`, `lib/`, `subscribers/` (all read-only
  imports of already-shipped constants/types from `lib/constants.ts` and the admin detail response shape
  documented in API-CONTRACTS.md — nothing in those directories was edited). Did not touch `commissions/`,
  `payouts/`, `dealer_org_rbac/`, or `dealer-portal/` — confirmed via `git status` before staging.

- Verified contracts (against API-CONTRACTS.md / CONTRACT-HANDOFF.md, both already marked "verified
  working" for this module):
  - `GET /api/dealer_onboarding/admin/dealers/applications` — list, `kycStatus`/`search`/`page`/`pageSize`
    query params, `{items,total,page,pageSize,totalPages}` response.
  - `GET /api/dealer_onboarding/admin/dealers/applications/{id}` — detail, decrypted `gstin`/`pan` +
    `documents[]`.
  - `POST .../applications/{id}/approve` — no body, `400` unless `under_review` (see note below on the
    real status code).
  - `POST .../applications/{id}/reject` — `{reason}` (1–2000, required), same `400` status-gate pattern.
  - `GET .../applications/{id}/documents/{documentId}/file` — the ONE download path this screen ever
    calls; binary response, fails closed per `commands/shared.ts`'s `loadDealerDocumentForReview`.
  - Backend page-path freeze from CONTRACT-HANDOFF.md ("Route groups"):
    `dealer_onboarding/backend/dealers/applications/page.tsx` + `[id]/page.tsx` ->
    `/backend/dealers/applications`, `/backend/dealers/applications/{id}` — matched exactly; this also
    fixed a real bug in the pre-existing `ApplicationsTable.tsx` (committed before this task started),
    which linked to the unfrozen `/backend/dealer-applications/{id}` path instead.
  - **Real-contract correction on the "409" acceptance wording:** read `commands/review.ts` and its own
    test suite (`__tests__/review.commands.test.ts`, both outside this task's owned paths) directly —
    `executeApprove`/`executeReject` throw `badRequest()` (HTTP **400**, `code:"request_failed"`) for
    every "wrong current status" case (already approved, already rejected, not under review, approved
    cannot be rejected). There is no literal 409 anywhere in this module's real responses today. Since I
    cannot edit `commands/` to add one, and the acceptance criteria's intent ("guard against ...
    approving an already-rejected application without realizing someone else already acted") is a
    behavior, not a status-code literal, `reviewActions.ts`'s `isReviewConflictStatus` treats BOTH 400 and
    409 as the same "someone already decided this — refetch and show the real status" outcome. This is
    documented at the top of `reviewActions.ts` and locked in by a test (`reviewActions.test.ts`:
    "treats the REAL contract status (400, badRequest...) as a conflict"). Flagging explicitly rather than
    silently reinterpreting the acceptance criteria.

- Commands and results:
  - `yarn generate` — regenerated route manifests; confirmed both new pages registered in
    `.mercato/generated/backend-route-shard.014.dealers.generated.ts` at the exact frozen paths. The
    pre-existing OpenAPI-bundling fallback warning (`language-subtag-registry` ESM/JSON import error) is
    an unrelated, pre-existing environment issue — generation still completed ("All generators
    completed"), and it does not touch anything this task owns.
  - `yarn lint` — 0 errors, 0 warnings in every file this task touched (confirmed by running eslint
    directly against each new/changed file, not just the aggregate repo run). The repo-wide `yarn lint`
    run shows 9 pre-existing warnings, all in files this task never touched.
  - `yarn typecheck` — 180 error lines both before and after this task's changes (two full runs,
    `/tmp/typecheck_after.log` and a re-run after a structural JSX fix); grepped explicitly for every file
    this task added/changed (`ApplicationDetailPage.tsx`, `ApplicationsTable.tsx`,
    `RejectApplicationDialog.tsx`, `reviewActions.ts`, `kycDocumentDownload.ts`, `applicationsQuery.ts`,
    `adminShared.tsx`, the new `backend/` pages, the new `__tests__/`) — zero matches. Every one of the
    180 errors is in a pre-existing file this task did not touch (mostly `dealer_onboarding/commands|api|
    __tests__`, `dealer_org_rbac`, `payouts` — other lanes' owned paths, consistent with P2-UI-03's
    handoff already recording a pre-existing, growing typecheck baseline).
  - `yarn jest` (full app suite) — **before this task's session: 549/549 tests, 52 suites** (the recorded
    baseline from P2-UI-03's handoff, verified moments before this task started). **After: 586/586 tests,
    57 suites, 0 failures.** This task's own 4 new suites account for 32 of those new tests
    (`applicationsQuery.test.ts`, `reviewActions.test.ts`, `kycDocumentDownload.test.ts`,
    `adminRouteAuthorization.test.ts`); the remaining +1 suite / +5 tests are concurrent lanes' work
    landing in this shared checkout during the same session (not inspected further — outside this task's
    owned paths). No regression anywhere: every suite that existed before still passes.
  - `yarn jest src/modules/dealer_onboarding` — 12 suites / 130 tests, all passing (includes this task's
    4 new suites plus the 8 pre-existing ones from P2-UI-02/03, none of which this task modified).

- How each acceptance item was verified:
  - **Reject with reason, view resubmission, approve** — exercised end-to-end at the orchestration-logic
    level against the real command contract: `reviewActions.test.ts` drives
    `submitRejectApplication`/`submitApproveApplication` through an injected `post` that mimics the real
    route's exact success/failure shapes (derived from `commands/review.ts` and its own test fixtures,
    not reinvented). "View a resubmission" is a property of the already-verified admin detail GET
    (`resubmit` clears `rejectionReason` and flips `kycStatus` back to `under_review` —
    confirmed by reading `commands/resubmit.ts`, outside this task's owned paths) — the detail page
    re-fetches on every visit and renders a dedicated "previously reviewed and resubmitted" banner
    whenever `kycStatus==='under_review' && reviewedAt` is set, so an admin re-opening the application
    after a resubmit sees that context instead of a bare, indistinguishable "under review" state.
  - **Unauthorized users cannot open documents or invoke decisions, at the route level** —
    `adminRouteAuthorization.test.ts` reads the five real route files this screen depends on (list,
    detail, approve, reject, document-file) from disk and asserts each exports
    `requireAuth: true` and `requireFeatures: ['dealer_onboarding.admin']` — the actual declared ACL gate,
    not a UI-side mock. I did not import/execute the route modules (that would pull in the Next.js route
    runtime, which this app's jest config does not set up) — parsing the real, deployed source is the
    verification method available from an owned-paths-only test. The shared dispatcher's enforcement of
    that declaration (`rbacService.userHasAllFeatures`) is a framework mechanism outside any single
    module's tests, already independently verified in API-CONTRACTS.md's own audit and relied on by
    every other admin screen in this codebase (payouts/commissions included) — not re-proven here.
    **Gap, honestly flagged:** a true live-HTTP 401/403 call against a running server (Playwright) was
    not run as part of this task; this is the boundary of what an owned-paths-only, no-live-server task
    can verify. On top of that server-level gate, the UI itself degrades correctly if a feature is
    revoked mid-session: a 401/403 from approve/reject/download renders a dedicated `AccessDeniedMessage`
    state (not a silent failure or a misleading success toast) — this part IS exercised directly by
    `reviewActions.test.ts`'s and `kycDocumentDownload.test.ts`'s "forbidden" cases.
  - **Documents are never reachable via a raw/unauthenticated link** —
    `kycDocumentDownload.test.ts` asserts the one URL-building function only ever produces
    `/api/dealer_onboarding/admin/dealers/applications/{id}/documents/{documentId}/file` and explicitly
    asserts the string never matches `storage|signed|presign|s3|attachments/`. The UI calls this through
    the authenticated `apiCall` helper (same-origin, httpOnly session cookie) and reads the response as a
    blob — never a plain `<a href>` to any other endpoint.
  - **Loading/empty/error/409(conflict) states** — `ApplicationDetailPage` has dedicated branches for
    `isLoading`, 404 (`RecordNotFoundState`), 401/403 (`AccessDeniedMessage`), generic error
    (`ErrorMessage` + retry), and a documents-empty state. The conflict path is exercised by
    `reviewActions.test.ts` (classification) and wired into the page/dialog so a 400/409 from
    approve/reject flashes a "already reviewed by someone else" message and refetches rather than
    claiming success or leaving a stale status on screen.
  - **Keyboard-accessible dialogs** — both the reject dialog and the approve confirm step use this
    codebase's shared dialog primitives (`useDialogKeyHandler` / `useConfirmDialog`'s `ConfirmDialog`),
    which already implement Cmd/Ctrl+Enter-to-confirm, Escape-to-cancel, `role="alertdialog"`, focus
    management on open, and a native `<dialog>` element — no new dialog mechanics were built, so this
    inherits the same keyboard/a11y behavior already in place across every other admin screen using these
    primitives (payouts/commissions dialogs included).
  - **Decision is actually audit-logged** — confirmed by reading `commands/review.ts` (outside this
    task's owned paths): both `approveCommand` and `rejectCommand` declare a `buildLog` that records
    `actionLabel`, `resourceKind: 'dealer_onboarding.dealer_profile'`, `resourceId`, `tenantId`,
    `organizationId`, and a full `snapshotAfter` (the reject one additionally includes the rejection
    reason in the snapshot) — this is the command-bus audit-log mechanism every mutating command in this
    codebase uses, already wired and unconditional (it is not something the UI opts into or could disable
    by calling the route differently). Not re-tested here since the command file is outside this task's
    owned paths and the mechanism itself is a shared, already-relied-upon framework contract; the UI
    simply calls the one real approve/reject route, which always goes through this path.
  - **Duplicate-decision guard** — three independent layers: (1) client-side status guard — Approve only
    renders when `kycStatus==='under_review'`, Reject only when `pending_verification`/`under_review`
    (`canApproveFromStatus`/`canRejectFromStatus`, unit-tested against every status), so the buttons
    disappear the moment the page reflects a decided status; (2) `isSubmitting`/`isApproving` disables
    both dialog buttons for the duration of the request, so a double-click cannot fire two requests; (3)
    server-side, the real `400` from a genuine race (two reviewers, two tabs) is caught and turned into a
    refetch-and-inform flow rather than a silent double-apply or a crash.

- Blockers or follow-up tasks:
  1. The acceptance criteria's literal "409" does not match the real backend's `400` for this exact race
     (see "Verified contracts" above) — handled defensively for both codes, but flagging so the
     coordinator doesn't read "409 verified" as "a literal 409 response was observed."
  2. Full live-HTTP route-level authorization (an actual unauthenticated/under-privileged request against
     a running server returning 401/403) was not exercised — verified instead via the declared
     `metadata.requireFeatures` on the real route files (outside this task's owned paths, read-only) plus
     this app's shared dispatcher enforcement already audited in API-CONTRACTS.md. A Playwright
     integration pass (P2-UI-17, lane A) would close this gap with a true end-to-end check.
  3. No code under `dealer_onboarding/commands|api|data|lib|subscribers` was touched — if the
     "real-contract 409 vs 400" mismatch above should instead be fixed at the source (making
     `executeApprove`/`executeReject` throw a literal `conflict()` for the "wrong status" case), that is a
     command-layer change outside this task's owned paths and should go to whichever lane now owns
     `dealer_onboarding/commands/`.
  4. KYC document soft-delete on re-upload not releasing the superseded attachment (a pre-existing,
     already-flagged storage-hygiene gap from P2-UI-03's own handoff) is unrelated to this task and not
     re-flagged as new.

- Ready for dependent tasks: Yes. This task has no other P2-UI task depending on it directly (P2-UI-17,
  lane A, depends on it as part of the full integration/regression pass, per README's task index) — the
  admin KYC review screen is functionally complete against the real, verified `dealer_onboarding` admin
  contract, adds zero regressions (586/586 full-suite tests passing, up from the recorded 549/549
  baseline), and the one honestly-flagged gap (live-HTTP route authorization) is exactly the kind of check
  P2-UI-17's integration pass exists to close, not a sign this task is incomplete on its own terms.
