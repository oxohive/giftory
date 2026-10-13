# P2-UI-11: Admin KYC application review

- Status: Planned; implementation not started
- Owner lane: D
- Depends on: P2-UI-00, P2-UI-03
- Owned paths: dealer_onboarding/backend/; dealer_onboarding/components/; dealer_onboarding/i18n/ under apps/mercato/src/modules/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [ ] Add application list with supported search/status pagination and application detail.
- [ ] Review business details and authorized private documents; approve or reject with required reason.
- [ ] Use installed DataTable/CrudForm and API helpers; feature metadata and localized strings.
- [ ] Display action result and refreshed status; prevent accidental duplicate review.

## Acceptance and verification

- [ ] Reviewer can reject, view resubmission and approve an actual fixture application.
- [ ] Unauthorized users cannot open documents or invoke decisions.
- [ ] Loading/empty/error/409 states, keyboard dialogs and audit behavior verified.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [ ] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Not started
- Changed files: None
- Verified contracts:
- Commands and results:
- Blockers or follow-up tasks:
- Ready for dependent tasks: No
