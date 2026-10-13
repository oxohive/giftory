# P2-UI-01: Dealer portal scaffold and shared UI foundation

- Status: Planned; implementation not started
- Owner lane: A
- Depends on: P2-UI-00
- Owned paths: apps/dealer-portal root config, src/app/layout.tsx, src/app/globals.css, src/components/ui/, src/components/layout/, src/lib/http/, src/lib/money/; packages/ui/; packages/api-client/; shared dependency files

Read [README.md](README.md) before starting. Dependencies must have verified handoffs; this file does not authorize editing another lane's files. All paths are relative to the repository root unless stated otherwise. Module-relative paths refer to apps/mercato/src/modules/.

## Work

- [ ] Create apps/dealer-portal on port 3200 matching the storefront's installed Next.js conventions and compatible runtime.
- [ ] Create shared packages/ui and packages/api-client with typed contracts from task 00 and additive package linking; keep existing npm storefront and Yarn backend workflows functional. Do not convert the monorepo package manager.
- [ ] Provide responsive shell, navigation, forms, table states, status badges, dialogs, money/date formatting and stable exports for feature agents.
- [ ] Own all app/package manifests, lockfiles, global CSS, shared navigation, route-group layouts and common test configuration; accept change requests from other lanes.
- [ ] Introduce storefront consumption of the shared UI only through a minimal parity-preserving integration, with existing storefront visual/build checks.

## Acceptance and verification

- [ ] Portal installs, typechecks and builds; development port is 3200.
- [ ] Shared UI works in both portal and storefront without route or styling regression.
- [ ] Mobile navigation, keyboard focus and loading/error/empty states work.
- [ ] Add focused tests for meaningful behavior; use real contract fixtures, not implementation-mirroring assertions.
- [ ] Record changed files, exact checks and results, remaining gaps and required coordination in the handoff below.

## Agent handoff

- Status: Not started
- Changed files: None
- Verified contracts:
- Commands and results:
- Blockers or follow-up tasks:
- Ready for dependent tasks: No
