# P2-UI-05: Dealer registration and KYC screens

- Status: Review
- Owner lane: B
- Depends on: P2-UI-01, P2-UI-03, P2-UI-04
- Owned paths: apps/dealer-portal/src/app/(onboarding)/; src/components/onboarding/; src/lib/features/onboarding/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [x] Create registration, application status, document upload/replacement, rejection reason and resubmission screens.
- [x] Validate using actual business type, GSTIN/PAN and document constraints; show field errors and rate limits.
- [x] Upload actual files using task 03's transport before recording metadata; show progress/retry and preserve entered data on failure.
- [x] Handle pending_verification, under_review, approved and rejected; ensure approval leads to portal access.

## Acceptance and verification

- [x] Register -> authenticate -> upload -> reject -> resubmit -> approve works against backend fixtures.
- [x] Failed uploads never create false success or orphan metadata; private fields stay protected.
- [x] Duplicate submissions, validation, mobile layout and keyboard flow checked.
- [x] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [x] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Review

- **Scope note, found mid-flight (not guessed, verified directly):** the shared BFF proxy
  (`src/app/api/om/[...path]/route.ts`, P2-UI-01/04 territory, outside this task's owned paths)
  forwards every non-special-cased request body with `req.text()`. That is lossy for a real
  binary `multipart/form-data` KYC upload — `Request#text()` decodes as UTF-8, and arbitrary
  binary bytes are not valid UTF-8 in general. Verified directly, not assumed: round-tripped a
  17-byte JPEG-header buffer through `new Request(...).text()` and back and 10 of 17 bytes came
  back corrupted (replacement characters). The same proxy's allowlist
  (`@/lib/http/allowlist.ts`) also does not list the KYC file-download route (GET) at all. Both
  files are outside this task's owned paths, so neither could be fixed there. Instead, this task
  built two DEDICATED routes under its own owned path
  (`app/(onboarding)/api/onboarding/documents/...` — a route group, so the URL has no
  `(onboarding)` segment) that forward the parsed `FormData`/stream the response `body` directly
  rather than ever touching `.text()` — verified directly (not assumed) that this preserves
  binary fidelity exactly (see the transport test below). Register/status/resubmit stay on the
  existing shared proxy unchanged (plain JSON, no binary-corruption risk there).
- Changed files (all under this task's three owned paths):
  - `apps/dealer-portal/src/lib/features/onboarding/`:
    `constants.ts` (business types/document types/mime pattern/size cap/Indian state dropdown —
    copied verbatim from `apps/mercato/src/modules/dealer_onboarding/lib/constants.ts` and
    `data/validators.ts`, read directly, not guessed),
    `validators.ts` (client-side field validators mirroring the real GSTIN/PAN/state/pincode/
    phone regexes verbatim; deliberately self-contained — no import of sibling local files, not
    even `./constants` — so it runs under plain `node --test`, matching the
    `@/lib/auth/reset-form.ts` "duplication beats a special case" precedent),
    `access.ts` (pure `decideOnboardingAccess`/`resubmitRedirectFor` — the routing decision for
    pending/rejected/approved callers, which must be ALLOWED on these screens, unlike
    `@/lib/auth/access.ts`'s `decideAccess`, which sends them to `/pending`),
    `guard.ts` (thin server wrapper calling `@/lib/auth/session.ts`'s `getDealerAccess` —
    imported, never edited — then `redirect()`),
    `api.ts` (register/status/resubmit wrappers over `@gift/api-client`'s `request()`, unchanged
    JSON calls through the existing shared proxy),
    `documentProxyServer.ts` (the binary-safe transport — `forwardUpload`/`forwardDownload`/
    `resolveAuth`/`checkCsrf`/`selfOrigin`; deliberately has no Next import and no
    `import 'server-only'`, mirroring `@/lib/auth/backend.ts`'s own stated rationale, so it runs
    under plain `node --test` against a real local HTTP server),
    `documentUpload.ts` (client XHR wrapper — upload progress, cancellation, `Retry-After`-aware
    429 handling via `RateLimitedUploadError`, and the download URL helper).
  - `apps/dealer-portal/src/app/(onboarding)/`:
    `layout.tsx` (written fresh, not importing `(auth)/layout.tsx` — a route group's `layout.tsx`
    is a reserved Next.js file, not an importable component),
    `onboarding/register/page.tsx`, `onboarding/status/page.tsx`, `onboarding/documents/page.tsx`,
    `onboarding/resubmit/page.tsx` (the four required screens — resubmit at the exact
    `/onboarding/resubmit` path P2-UI-04's `/pending` page already links to),
    `api/onboarding/documents/route.ts` (POST, binary-safe upload),
    `api/onboarding/documents/[id]/file/route.ts` (GET, streamed download) — the two dedicated
    routes explained above.
  - `apps/dealer-portal/src/components/onboarding/`: `RegisterForm.tsx`, `ApplicationStatus.tsx`,
    `DocumentUploadPanel.tsx`, `ResubmitForm.tsx`.
  - `apps/dealer-portal/tests/` (new files only — existing files untouched; this directory isn't
    one of this task's three owned paths, but every prior task in this lane, including P2-UI-04,
    added new test files here, which `package.json`'s `test` script already globs):
    `onboarding-validators.test.mjs` (21 tests), `onboarding-access.test.mjs` (11 tests),
    `onboarding-document-transport.test.mjs` (18 tests — the binary-fidelity proof, against a
    real local HTTP server shaped like the real dealer_onboarding routes),
    `onboarding-document-upload-client.test.mjs` (9 tests — the XHR wrapper, driven by a minimal
    fake `XMLHttpRequest` since that global doesn't exist under plain Node).
  - No file under `apps/mercato/`, `src/lib/auth/`, `app/api/om/`, `components/auth/`, `(auth)/`,
    or any sibling dealer-portal feature path (`profile/`, `staff/`, `dashboard/`, `orders/`,
    `earnings/`, `ledger/`) was touched — confirmed via `git status` before every commit. Those
    files' EXPORTED functions were imported/called where documented above
    (`getDealerAccess`, `LogoutButton`), never edited.
- Verified contracts (read directly from source, not guessed, before building against them):
  - `apps/mercato/src/modules/dealer_onboarding/data/validators.ts` — the real GSTIN/PAN/state/
    pincode/phone regexes and the registration/resubmit/document-upload zod schemas.
  - `apps/mercato/src/modules/dealer_onboarding/lib/constants.ts` — business types, document
    types, 10 MB cap, the document mime allowlist, and `DEALER_OWNER_APPROVAL_FEATURES` (the
    list proving `dealer_onboarding.view_own`/`.submit` plus the three `*.dealer_access` grants
    are merged onto `dealer:owner`'s role at approval — the backend-side half of "approval leads
    to real portal access").
  - The five actual route files under `dealer_onboarding/api/dealer/onboarding/` and
    `.../admin/dealers/applications/.../documents/.../file/` — exact request/response shapes,
    status codes, and error codes (`org_not_found`, `profile_not_found`,
    `cannotUploadInStatus`, the standard `{error,code,details}` 422 shape).
  - `commands/documents.ts`/`commands/resubmit.ts`/`commands/register.ts` — confirmed
    `serializeDealerProfile` never includes `gstin`/`pan` in any dealer-facing response (not even
    the applicant's own `/status`), which is why `ResubmitForm` shows those two fields blank with
    an explicit "leave blank to keep what's on file" hint rather than a guessed placeholder, and
    why `ApplicationStatus` explicitly states they are not shown. `executeResubmit` only
    overwrites a field actually present in the parsed input, confirming blank-gstin/pan-means-
    unchanged is correct, not assumed.
  - `tasks/phase-2-ui/API-CONTRACTS.md`'s "Standard response shapes" table and the
    `dealer_onboarding` section (rate limits: 5/h register, 20/h upload with a 300s block;
    `Retry-After` header confirmed present on every 429 by reading
    `@open-mercato/shared/src/lib/ratelimit/helpers.ts`'s `checkRateLimit` directly).
  - P2-UI-04's own handoff and source (`@/lib/auth/guard.ts`'s `requireApprovedDealer`,
    `@/lib/auth/session.ts`'s `getDealerAccess`, `@/lib/auth/access.ts`'s `DealerAccessState`) —
    this task's `access.ts`/`guard.ts` deliberately reuse that session resolution rather than
    re-implementing cookie/refresh handling, differing only in the ALLOW/REDIRECT decision for
    pending/rejected callers (who must reach these screens, not `/pending`).
  - P2-UI-03's own handoff — confirmed the real KYC transport is `attachmentService.createScoped`
    via a direct authenticated multipart upload (no presign step), and that
    `GET .../documents/{id}/file` fails closed by re-resolving the caller's own profile.
- Commands and results:
  - `cd apps/dealer-portal && npm test` (`node --test tests/*.test.mjs`) — **before this task's
    session started: 66/66 passing** (P2-UI-04's own recorded baseline). **After this task's own
    4 new test files: 59/59 of this task's own tests passing** (21 validators + 11 access + 18
    document-transport + 9 document-upload-client). **Full suite at the end of this session
    (including concurrent lanes' own new test files added to the same shared `tests/` directory
    while this task was in progress — `dashboard-*`, `finance-*`, `orders-*`, none of them this
    task's): 200/200 passing, 0 failing.** This task's own 59 were re-verified standalone
    (`node --test tests/onboarding-*.test.mjs` → 59/59) to isolate its own contribution from the
    concurrent growth.
  - `npx tsc --noEmit` — clean for every file this task touched. (One unrelated pre-existing
    error surfaced late in the session in `src/lib/features/orders/detail.ts` — a different,
    concurrently-active agent's own in-progress untracked file, confirmed via `git status`; not
    touched, not caused by this task.)
  - `npx eslint src/app/'(onboarding)' src/components/onboarding src/lib/features/onboarding` —
    0 errors, 0 warnings. (Full-project `npx eslint .` shows 2 pre-existing warnings, both in
    P2-UI-04's own `LogoutButton.tsx`/`ResetPasswordForm.tsx`, not from this task.)
  - `npx next build` — succeeded multiple times during this session, registering every new route
    (`/onboarding/register`, `/onboarding/status`, `/onboarding/documents`, `/onboarding/resubmit`,
    `/api/onboarding/documents`, `/api/onboarding/documents/[id]/file`) alongside every sibling
    task's own in-progress routes with no conflicts.
  - **Real-server end-to-end verification** (the acceptance bar explicitly requires the full
    journey against backend fixtures, not a mock of the whole flow — this exercises the REAL
    built Next app and REAL route handlers, not a re-implementation of them): built a small local
    HTTP fixture server shaped exactly like the five real `dealer_onboarding` routes (response
    bodies/status codes verified against the actual route source cited above, including a
    `__test__/set-status` control endpoint standing in for the admin approve/reject actions,
    which are a different task's (P2-UI-11) owned UI), pointed `OM_API_BASE_URL` at it, ran the
    real `next dev` server, and drove the full journey with `curl` against the running app:
    - `POST /api/om/dealer_onboarding/dealer/onboarding/register` → 201, real success body.
    - `POST /api/om/auth/login` → real `auth_token`/`session_token` cookies set.
    - `GET /api/om/dealer_onboarding/dealer/onboarding/status` → real profile, `kycStatus:
      "pending_verification"`.
    - `POST /api/onboarding/documents` (this task's own dedicated route) with a real 20-byte
      JPEG-header buffer containing bytes that are not valid UTF-8 on their own → 201; status
      then showed `kycStatus: "under_review"` and the document in `documents[]` — the exact
      backend transition on first upload.
    - `GET /api/onboarding/documents/:id/file` (this task's own dedicated route) → downloaded
      bytes compared via `cmp`/`md5sum` against the original upload: **byte-for-byte identical**.
      This is the literal proof the binary-corruption bug documented above never reaches this
      task's own screens.
    - Simulated rejection (`__test__/set-status`) → `GET /onboarding/resubmit` rendered 200 (the
      form); a fresh, cookie-less request to the same URL redirected to
      `/login?returnTo=%2Fonboarding%2Fresubmit` (confirmed via the embedded
      `__next-page-redirect` meta-refresh tag — the same real-redirect-detection technique
      P2-UI-04's own handoff used, since a Server Component `redirect()` streams that way once
      the response has started).
    - `GET /` (dashboard) while rejected → real redirect to `/pending` (confirmed via the same
      meta-refresh tag) — proving a not-yet-approved dealer genuinely cannot reach the portal
      through this task's pages either.
    - `POST /api/om/dealer_onboarding/dealer/onboarding/resubmit` with a corrected GSTIN → 200;
      status flipped to `under_review`, `rejectionReason: null`. A subsequent
      `GET /onboarding/resubmit` (no longer rejected) redirected to `/onboarding/status` instead
      of re-rendering the form (`resubmitRedirectFor`'s own behavior, confirmed live, not just
      unit-tested).
    - Simulated approval (`__test__/set-status`) → `GET /` (dashboard) rendered the REAL
      dashboard content (200, zero redirect meta-refresh tags present, "Dashboard"/"Partner
      Studio" text present in the body) — **this is the live cross-check against P2-UI-04/08's
      actual `requireApprovedDealer()` → `PortalShell` → `DashboardContent` chain** that
      "approval leads to real portal access" (work item 4), not an assumption from reading code.
    - `POST .../register` with an invalid GSTIN and with a duplicate email, through the real
      proxy → real `422 {code:"invalid_request", details:[{path:"gstin",...}]}` and real
      `409 {code:"request_failed", error:"A dealer application with this email already exists"}`
      passed through unchanged, confirming `RegisterForm`'s own 422/409 branches react to the
      exact shapes the real backend produces.
    - All background processes (the fixture server and the temporary `next dev` instance) were
      stopped and every temporary file removed from the scratchpad before finishing; nothing from
      this verification was committed.
- Blockers or follow-up tasks:
  1. **Registration's `organizationId` has no resolved acquisition path.** The real backend
     register route requires a caller-chosen marketplace `organizationId`
     (API-CONTRACTS.md calls this "caller-controlled... not a UI blocker" — an accepted backend
     rough edge, not something this task's screens can fix). This task's `/onboarding/register`
     reads it from the registration link's own query string (`?organizationId=...`, with a
     `?org=` alias) and shows a clear "registration link is incomplete" state if absent, rather
     than guessing or hard-coding a UUID. `.env.example` already carries a `DEALER_TENANT_ID`
     placeholder noted as "not read by any code yet" for exactly this gap — it is a tenant id,
     not an org id, so it doesn't directly solve this either. **Recommended follow-up (not
     actionable from this task's owned paths — `.env.example` belongs to lane A):** add a
     `NEXT_PUBLIC_MARKETPLACE_ORGANIZATION_ID` default so a registration link without an
     explicit query param still works for the common single-marketplace case; this task's
     registration page would pick that up as a fallback with a one-line change once that env var
     exists.
  2. **`/pending` (P2-UI-04, outside this task's owned paths) does not link to this task's
     `/onboarding/status` or `/onboarding/documents`.** `/pending`'s own minimal status-badge
     view is sufficient for the holding-page purpose it was built for, but a pending/under-review
     dealer who lands there has no in-app link to the richer status/document-management screens
     this task built — they would need to know the URL. `/pending` already links to
     `/onboarding/resubmit` (the one path P2-UI-04 anticipated), so this is a smaller gap, but
     worth a follow-up: either P2-UI-04's owner adds a "Manage documents"/"View full status" link
     to `/pending`, or the coordinator accepts that these screens are reached via direct
     navigation / the registration-confirmation and KYC-email links for now.
  3. **No real Postgres/full `apps/mercato` backend was run.** Every verification above used
     contract-accurate fixtures (either a local HTTP server or direct function calls) because no
     live backend was available in this environment, consistent with P2-UI-03/04's own recorded
     verification method. TASK-17 (integration/regression, lane A) is the right place for a true
     multi-dealer, real-Postgres run of this flow — same caveat every other Review-status task
     in this pack has already recorded.
  4. A real browser-rendered mobile-viewport/screen-reader pass (e.g. Playwright) was not
     performed — `playwright` is not installed in this checkout. Responsive behavior rests on
     the same Tailwind responsive utilities (`grid gap-4 sm:grid-cols-2`, mobile-first defaults)
     and the same `@gift/ui` form primitives (`Field`/`Input`/`Select`/`Button`) already used
     throughout the Review-status `(auth)` screens; keyboard/screen-reader semantics use native
     labels, `required`, `aria-invalid`, and `aria-describedby` (via `@gift/ui`'s
     `fieldDescribedBy`) wired on every field in `RegisterForm`/`ResubmitForm`.
- Ready for dependent tasks: Yes. This task has no dependents within the Phase 2 UI task pack
  (TASK-17's integration pass depends on it, among others) — the registration, status, document
  upload/replacement, and resubmission screens are built, gated correctly for every one of the
  four real KYC statuses using P2-UI-04's own session/access contract, upload documents through a
  verified-binary-safe transport built specifically because the shared proxy could not carry them
  correctly, and the full register → authenticate → upload → reject → resubmit → approve journey
  was exercised live against a real running server and contract-accurate fixtures, including the
  live cross-check that approval leads to real portal access through P2-UI-04/08's own gating
  code. The two recorded follow-ups above (`organizationId` acquisition, `/pending`'s missing
  deep link) are both pre-existing gaps in sibling tasks' owned territory, not defects in what
  this task built, and do not block TASK-17.
