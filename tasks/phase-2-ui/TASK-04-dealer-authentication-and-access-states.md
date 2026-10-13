# P2-UI-04: Dealer authentication and access states

- Status: Review
- Owner lane: B
- Depends on: P2-UI-00, P2-UI-01, P2-UI-02, P2-UI-03
- Owned paths: apps/dealer-portal/src/app/(auth)/; src/lib/auth/; src/app/api/om/; src/components/auth/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [x] Implement dealer login/logout and installed invitation/password setup flows using Open Mercato user identity, not storefront customer-account authentication.
- [x] Use secure server-managed sessions, an allowlisted proxy, safe return URLs and appropriate CSRF handling; no credentials in browser storage.
- [x] Gate approved portal routes and owner-only screens; route applicants to onboarding status and handle expired, forbidden and disabled sessions.
- [x] Coordinate session/proxy interfaces and layout wiring with lane A.

## Acceptance and verification

- [x] Owner, staff, applicant, rejected, disabled and expired-session journeys pass.
- [x] Direct navigation is protected on the server as well as in navigation.
- [x] No tokens exposed in rendered markup, logs or client storage.
- [x] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [x] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Review
- Changed files:
  - `apps/dealer-portal/src/lib/auth/` (new, this task's primary deliverable):
    - `return-to.ts` (pure) — `sanitizeReturnTo()`, the open-redirect guard for `?returnTo=`.
    - `csrf.ts` (pure) — `isTrustedOrigin()`, the Origin-header CSRF check (see rationale below).
    - `reset-form.ts` (pure) — JSON→form-encoded translation for the installed password-reset
      routes, mirroring `src/lib/http/login.ts`'s existing pattern for `auth/login`.
    - `allowlist.ts` (pure) — `isAuthAllowed()`/`AUTH_NO_REFRESH`/`AUTH_FORM_ENCODED_PATHS`,
      additive to (never editing) `src/lib/http/allowlist.ts` (lane A/P2-UI-01's file).
    - `backend.ts` (server-to-backend fetch helpers; deliberately has no `import 'server-only'`
      and no Next-API imports, so `tests/backend.test.mjs` can exercise it directly against a
      real local HTTP server instead of mocking this module itself).
    - `access.ts` (pure) — `resolveDealerAccess()`/`decideAccess()`, the actual access-decision
      logic; re-exports `DealerRole` from `components/layout/nav-items.ts` (lane A's file) so the
      two never drift.
    - `session.ts` (server-only, thin) — `getDealerAccess()`: reads cookies, calls `backend.ts`,
      calls `resolveDealerAccess()`.
    - `guard.ts` (server-only, thin) — `requireApprovedDealer()` / `requireRole(roles)`: the
      public contract every dependent task's page should call. See "Integration point for
      dependents" below.
  - `apps/dealer-portal/src/components/auth/` (new): `LoginForm.tsx`, `LogoutButton.tsx`,
    `ForgotPasswordForm.tsx`, `ResetPasswordForm.tsx` — all client components, all calling
    `@gift/api-client`'s `request()` through the proxy, never touching `localStorage`/
    `sessionStorage`/any client-readable storage.
  - `apps/dealer-portal/src/app/(auth)/` (new): `layout.tsx` (centered-card shell, no
    `PortalShell`/`PortalNav` — those are for the approved portal only), `login/page.tsx`,
    `pending/page.tsx` (the KYC holding page CONTRACT-HANDOFF freezes), `access-denied/page.tsx`
    (not-a-dealer / no-profile), `forbidden/page.tsx` (owner-only screen hit by staff),
    `forgot-password/page.tsx`, `reset/[token]/page.tsx` (installed password-setup/reset flow).
  - `apps/dealer-portal/src/app/api/om/[...path]/route.ts` (extended, not replaced — the diff is
    additive: 2 new imports' worth of allowlist/CSRF/form-translation wiring plus one new
    `selfOrigin()` helper; the pre-existing login/logout/refresh normalization is untouched):
    - Merges `isAuthAllowed()` into the existing `isAllowed()` check (and `AUTH_NO_REFRESH` into
      the existing `NO_REFRESH` check) so the installed `auth/reset`, `auth/reset/validate`,
      `auth/reset/confirm` routes are reachable, with the same JSON→form-encoded translation
      `auth/login` already needed.
    - Adds a CSRF check: every non-GET/HEAD request is rejected with 403 unless its `Origin`
      header (when present) matches this app's own origin. **Important bug found and fixed
      during verification**: the obvious implementation (`req.nextUrl.origin`) is wrong — a live
      test against a running dev server with `Host: 127.0.0.1:3201` showed `req.nextUrl.origin`
      reporting `http://localhost:3201` regardless (Next's internally-resolved canonical URL,
      decoupled from the actual `Host` header). That would reject every legitimate same-origin
      request in production, where the externally-visible host (behind this app's ALB) never
      matches Next's internal one. Fixed by deriving self-origin from
      `x-forwarded-proto`/`x-forwarded-host`/`host` headers instead, mirroring the backend's own
      `resolveRequestOrigin` (`@open-mercato/shared/src/lib/url.ts`) — re-verified against the
      same running server with a simulated reverse-proxy header set (`X-Forwarded-Host:
      dealer.giftory.example`), confirmed correct.
  - `apps/dealer-portal/tests/` (new, 56 tests added to the existing 10 — see Commands below):
    `return-to.test.mjs`, `csrf.test.mjs`, `reset-form.test.mjs`, `auth-allowlist.test.mjs`,
    `access.test.mjs`, `backend.test.mjs` (the last spins up a real local HTTP server shaped like
    the documented apps/mercato response contracts and exercises `backend.ts` against it, not a
    mock of `backend.ts` itself).
  - No `apps/mercato` file was touched (confirmed via `git status` — out of this task's owned
    paths; one unrelated concurrent change, `dealer_org_rbac/i18n/en.json`, was visible mid-session
    from another lane and was left untouched).
- Verified contracts used:
  - API-CONTRACTS.md: `GET /api/dealer_onboarding/dealer/onboarding/status`'s exact response
    shape and error codes (`404 profile_not_found`), and the standard 401/403 shapes.
  - CONTRACT-HANDOFF.md: the pending-KYC holding-page freeze ("TASK-04 owns this gate; TASK-08
    consumes it"), the dealer-portal route list/roles, and the "no deactivate — ...has an
    endpoint, see TASK-03" updates.
  - TASK-01's own handoff note (Blockers section) that `PortalShell`/`PortalNav` take `role` as a
    prop deliberately, for this task to resolve.
  - Read directly from `@open-mercato/core`'s `auth` module source (not just AGENTS.md, which is
    silent on these): `api/login.ts` (form-encoded, `isConfirmed===false` collapses into the same
    generic 401 as a wrong password — this is *why* "disabled" and "expired/invalid" are
    deliberately given the same user-facing treatment in this app, see `access.ts`'s doc comment),
    `api/logout.ts` (302 redirect), `api/session/refresh.ts` (POST takes `{refreshToken}` JSON),
    `api/profile/route.ts` (`{email,name,roles}`, no tenant/org), `lib/sessionIntegrity.ts`
    (`resolveCanonicalStaffAuthContext` rejects `isConfirmed===false` on every authenticated
    request — confirms deactivation really does revoke access, not just block fresh logins),
    `api/reset.ts`/`reset/confirm.ts`/`reset/validate.ts` (all form-encoded only,
    `POST /api/auth/reset` always returns `{ok:true}` regardless of account existence),
    `commands/users.ts`'s `sendInviteToUser` and `@open-mercato/shared/src/lib/url.ts`'s
    `getSecurityEmailBaseUrl` (confirms the real backend gap documented below).
  - `dealer_onboarding/lib/notificationEmails.ts` (confirms `DEALER_PORTAL_BASE_URL` + `/login`,
    no token, is used correctly for KYC approval/rejection emails — those already land here).
- Commands and results:
  - `cd apps/dealer-portal && node --test tests/*.test.mjs` → **66/66 pass** (baseline from
    P2-UI-01 was 10/10; 56 new tests added by this task, 0 removed/changed).
  - `npx tsc --noEmit` → clean (no errors).
  - `npx eslint .` → 0 errors, 2 warnings (both `@next/next/no-location-assign-relative-destination`,
    in `LogoutButton.tsx` and `ResetPasswordForm.tsx` — deliberate: `window.location.assign()`
    forces a full navigation so the next Server Component render observes the just-set/just-cleared
    httpOnly cookie, which a client-side `router.push()` is not guaranteed to do). Exit code 0 —
    matches P2-UI-01's own "lint clean" bar (that task's lint run was also warning-tolerant).
  - `npx next build` → succeeds; new routes register as expected (`ƒ /login`, `ƒ /pending`,
    `ƒ /access-denied`, `ƒ /forbidden`, `○ /forgot-password`, `ƒ /reset/[token]`, plus the
    unchanged `ƒ /api/om/[...path]`).
  - **Real server-side-gating verification** (the acceptance bar explicitly requires this, not a
    client-side-only check): started a local mock backend (`node:http`, canned responses shaped
    exactly like the documented contracts) on `127.0.0.1:3900`, pointed `OM_API_BASE_URL` at it,
    ran `next dev` on `127.0.0.1:3201`, added two temporary pages (`verify-guard-tmp` calling
    `requireApprovedDealer()`, `verify-guard-owner-tmp` calling `requireRole(['dealer:owner'])` —
    both deleted before finishing, mirroring P2-UI-01's own temporary-preview-route precedent),
    then hit them directly with `curl` using different `auth_token`/`session_token` cookie
    values, with `redirect` never followed by the client — this is a real HTTP-level check of
    what the server decided, not a browser/UI check:
    - No cookies → redirected to `/login` (confirmed via Next's embedded `__next-page-redirect`
      meta-refresh tag, since a Server Component's `redirect()` streams as that rather than a
      bare 3xx status once the response has started streaming — the protected page's content was
      never present in the response body in any denied case, confirmed by grep).
    - Approved owner → 200, real content rendered (`dealer:owner` visible in the body).
    - Approved staff hitting the owner-only gate → redirected to `/forbidden` (**this is the
      explicit "owner-only screens are actually gated" proof the acceptance criteria calls
      for** — a staff session genuinely cannot render that page, server-side, regardless of nav).
    - Approved owner on the owner-only gate → 200, allowed.
    - Pending (`pending_verification`/`under_review`) → redirected to `/pending`.
    - Rejected → redirected to `/pending` (same holding page, rejection-specific content).
    - Dealer role but no `DealerProfile` (`404 profile_not_found`) → redirected to
      `/access-denied?reason=no-profile`.
    - Non-dealer role (`employee`) → redirected to `/access-denied?reason=not-a-dealer`.
    - Invalid/unknown `auth_token`, no `session_token` to fall back to (the mid-session
      "disabled" case, and a plain expired-with-nothing-to-refresh case) → redirected to
      `/login` with no distinguishing reason, by design (see "disabled vs expired" below).
    - Valid `session_token` only (expired/absent `auth_token`) → the proxy's transparent-refresh
      path (duplicated read-only in `backend.ts`) successfully exchanged it and the page
      rendered allowed, end to end against the real refresh endpoint contract.
    - Expired `auth_token` + an invalid `session_token` → refresh failed → redirected to `/login`.
    - Grepped every response body across every scenario for the literal cookie token values —
      zero matches in any case, including the allowed ones (confirmed no credential/session
      value is ever echoed into rendered HTML).
  - Also verified live against the running server (same session): the merged proxy allowlist
    (`auth/reset` reachable and translated to form-encoding, confirmed via the mock backend
    receiving the translated request), the CSRF Origin check (cross-site `Origin` → 403;
    same-origin, no-`Origin`, and simulated-reverse-proxy `X-Forwarded-Host` → all correctly
    trusted after the `selfOrigin()` fix above).
  - Did **not** run `apps/mercato`'s `yarn jest` suite — this task touched zero files under
    `apps/mercato` (confirmed via `git status`), so there is nothing there to regress; the
    before/after requirement is conditioned on touching something that round-trips through it.
- Blockers or follow-up tasks:
  - **Integration point for dependents (TASK-05 through TASK-10, TASK-14)**: every real portal
    page should start with `requireApprovedDealer()` (owner+staff pages) or
    `requireRole(['dealer:owner'])` (owner-only pages — `/staff`, `/earnings` per
    CONTRACT-HANDOFF's nav freeze), both exported from `@/lib/auth/guard`, then mount
    `PortalShell`/`PortalNav` (lane A's components) with the resolved `role`:
    ```tsx
    import { requireApprovedDealer } from '@/lib/auth/guard'
    import { PortalShell } from '@/components/layout/PortalShell'

    export default async function DashboardPage() {
      const { role } = await requireApprovedDealer()
      return <PortalShell role={role}>{/* ...dealer_orders/commissions/payouts aggregates... */}</PortalShell>
    }
    ```
    No file outside this task's owned paths was edited to wire this in (e.g. no `(portal)` route
    group layout exists yet) — that wiring belongs to whichever task owns each page
    (TASK-08/09/10's dashboard/orders pages, TASK-06/07's profile/staff pages). This is a
    deliberate consequence of the owned-paths restriction, not an oversight: the gate is ready
    and verified; mounting it is each dependent task's own first step.
  - **Backend gap, confirmed by reading source, not fixable from any path this task owns**: a
    real dealer invite/first-password email (dealer registration's owner-invite, and
    `dealer_org_rbac`'s staff invite, both via the core `auth.users.create` command with
    `sendInviteEmail:true`) always links to **apps/mercato's own** `/reset/[token]` page
    (`getSecurityEmailBaseUrl()` reads only `process.env.APP_URL`, never the request — verified
    in `@open-mercato/shared/src/lib/url.ts` and `@open-mercato/core`'s `commands/users.ts`), not
    this app's `(auth)/reset/[token]` page built here. Only the forgot-password flow *started
    from* this app is guaranteed to land back here. This app's `/reset/[token]` page is built,
    correct, and ready regardless — it is exactly where the flow should go once/if a follow-up
    backend task threads a portal-aware base URL through user-creation (the same
    `DEALER_PORTAL_BASE_URL` pattern `dealer_onboarding/lib/notificationEmails.ts` already uses
    correctly for KYC approval/rejection emails). Flagged here for whichever lane next owns
    `@open-mercato/core`'s `auth` module or `dealer_org_rbac`'s invite command — not actionable
    from `apps/dealer-portal`'s owned paths (that file lives in a published package).
  - **"Disabled" is deliberately not distinguished from "expired/invalid session"** in this app's
    UI (both land on `/login` with the same generic messaging, or no message at all). This is a
    considered decision, not a gap: the backend's own `api/login.ts` collapses
    `isConfirmed===false` into the identical 401 a wrong password gets, and
    `auth` module's AGENTS.md explicitly says never reveal account-existence/deactivation state
    through an auth response. Building a dealer-portal-side heuristic to guess "disabled" apart
    from "expired" would itself be an account-state oracle the backend deliberately declines to
    provide. See `access.ts`'s `DealerAccessState.unauthenticated` doc comment for the full
    reasoning.
  - The `/pending` page's "Resubmit application" CTA links to `/onboarding/resubmit`, which does
    not exist yet — that page is TASK-05's (dealer registration/KYC screens) to build. Linking to
    it now is deliberate (it is the documented destination,
    `POST /api/dealer_onboarding/dealer/onboarding/resubmit`, already allowlisted by lane A's
    proxy) rather than a guessed path; it 404s until TASK-05 lands.
  - Gap 2 (multi-dealer ACL-clobbering) from API-CONTRACTS.md was reported fixed by TASK-02 before
    this task started; this task's own verification used a mock backend (not a live
    `apps/mercato` + real Postgres), so it did not re-prove Gap 2's fix — that remains TASK-17's
    (integration/regression) job against a real multi-dealer tenant.
- Ready for dependent tasks: Yes. The session/access-decision contract (`@/lib/auth/guard`'s
  `requireApprovedDealer`/`requireRole`) is stable, documented, and verified end to end against a
  real running server for all six required journeys (owner, staff, applicant, rejected, disabled,
  expired-session) plus the two additional states the real contract requires (`not-a-dealer`,
  `no-profile`). The one open item (invite-email base URL) is a backend-owned gap outside every
  path this task could touch, not a defect in what this task built.
