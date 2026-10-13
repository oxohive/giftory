# P2-UI-04: Dealer authentication and access states

- Status: Planned; implementation not started
- Owner lane: B
- Depends on: P2-UI-00, P2-UI-01, P2-UI-02, P2-UI-03
- Owned paths: apps/dealer-portal/src/app/(auth)/; src/lib/auth/; src/app/api/om/; src/components/auth/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [ ] Implement dealer login/logout and installed invitation/password setup flows using Open Mercato user identity, not storefront customer-account authentication.
- [ ] Use secure server-managed sessions, an allowlisted proxy, safe return URLs and appropriate CSRF handling; no credentials in browser storage.
- [ ] Gate approved portal routes and owner-only screens; route applicants to onboarding status and handle expired, forbidden and disabled sessions.
- [ ] Coordinate session/proxy interfaces and layout wiring with lane A.

## Acceptance and verification

- [ ] Owner, staff, applicant, rejected, disabled and expired-session journeys pass.
- [ ] Direct navigation is protected on the server as well as in navigation.
- [ ] No tokens exposed in rendered markup, logs or client storage.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [ ] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Not started
- Changed files: None
- Verified contracts:
- Commands and results:
- Blockers or follow-up tasks:
- Ready for dependent tasks: No
