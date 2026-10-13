# P2-UI-05: Dealer registration and KYC screens

- Status: Planned; implementation not started
- Owner lane: B
- Depends on: P2-UI-01, P2-UI-03, P2-UI-04
- Owned paths: apps/dealer-portal/src/app/(onboarding)/; src/components/onboarding/; src/lib/features/onboarding/

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [ ] Create registration, application status, document upload/replacement, rejection reason and resubmission screens.
- [ ] Validate using actual business type, GSTIN/PAN and document constraints; show field errors and rate limits.
- [ ] Upload actual files using task 03's transport before recording metadata; show progress/retry and preserve entered data on failure.
- [ ] Handle pending_verification, under_review, approved and rejected; ensure approval leads to portal access.

## Acceptance and verification

- [ ] Register -> authenticate -> upload -> reject -> resubmit -> approve works against backend fixtures.
- [ ] Failed uploads never create false success or orphan metadata; private fields stay protected.
- [ ] Duplicate submissions, validation, mobile layout and keyboard flow checked.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [ ] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Not started
- Changed files: None
- Verified contracts:
- Commands and results:
- Blockers or follow-up tasks:
- Ready for dependent tasks: No
