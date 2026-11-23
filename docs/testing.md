# Testing Giftory

This page covers every test suite in the repo: how to run each one, what it needs, what CI runs, and the testing rules every change must follow.

Last verified: 2026-11-23, on Windows 11 with Node 24.20.0 and npm 11.19.0. All numbers below come from those runs.

## At a glance

| Suite | Where | Command | Needs | Result (2026-11-23) | In CI? |
|---|---|---|---|---|---|
| Mercato unit tests (Jest) | `apps/mercato` | `yarn test` | `yarn install` | 64 suites, 638/638 pass | Yes |
| Mercato integration (Playwright, ephemeral) | `apps/mercato` | `yarn test:integration:ephemeral` | Docker running, `yarn install`, Playwright browsers | Not run (Docker daemon was not running) | No |
| Shared package tests (`node:test`) | `packages/api-client`, `packages/ui` | `npm test` | Nothing (no install) | 8/8 and 15/15 pass | Yes |
| Dealer portal unit tests (`node:test`) | `apps/dealer-portal` | `npm test` | `npm install` | 300/300 pass | Yes |
| Dealer portal lint | `apps/dealer-portal` | `npm run lint` | `npm install` | 0 errors, 2 warnings | No |
| Dealer portal typecheck | `apps/dealer-portal` | `npm run typecheck` | `npm install` | **Fails** (see Known gaps) | No |
| Storefront typecheck + lint | `apps/storefront` | `npm run typecheck`, `npm run lint` | `npm install` | Both pass on a clean install | No (recommended later) |
| Storefront end-to-end (Playwright) | `apps/storefront` | `npx playwright test` | Both apps running locally, seeded data | Not run (needs live servers) | No |
| Mobile unit tests (Jest, `jest-expo`) | `apps/mobile` | `npm test` | `npm install` | 9 suites, 44/44 pass | No |
| Mobile typecheck | `apps/mobile` | `npm run typecheck` | `npm install` | Passes, no errors | No |

## Mercato backend (`apps/mercato`)

### Unit tests

```bash
cd apps/mercato
yarn install
yarn test                 # every suite under src/
yarn test src/modules/commissions   # one module
```

- The config is `apps/mercato/jest.config.cjs`. It only looks under `src/` and skips `__integration__/` folders, which hold Playwright specs.
- Unit tests sit next to the code in `__tests__/` folders, for example `src/modules/dealer_orders/__tests__/`.
- Some tests read source files to check contracts, such as "no edit/delete controls" or "every route declares its ACL feature". If such a test compares file paths, convert them to forward slashes first (`p.split(path.sep).join('/')`). Otherwise the test fails on Windows, where `path.join` uses `\`.
- No database is needed. Tests that touch the ORM use mocked EntityManagers.

### Integration tests (ephemeral environment)

```bash
cd apps/mercato
yarn test:integration:ephemeral                      # all __integration__ specs
yarn test:integration:ephemeral --filter dealer      # specs whose path matches
```

What it does: the Open Mercato CLI (`@open-mercato/cli`) does the following:

1. Starts a throwaway Postgres container (`pgvector/pgvector:pg16`) through Testcontainers.
2. Runs migrations and seeds that database.
3. Builds the app for production (`yarn build`, about 1–2 minutes) and starts it.
4. Runs every `src/modules/*/__integration__/*.spec.ts` with Playwright, passing `BASE_URL` and `DATABASE_URL` to the specs.

What it needs:
- **Docker Desktop, or another Docker-compatible runtime, must be running.** The harness runs `docker info` first and stops with a clear message if Docker is not available.
- Playwright browsers. Install them once with `npx playwright install chromium`.
- It never touches the Supabase database. It creates its own container and uses that.

Useful flags: `--keep` keeps the environment running after the tests, `--verbose`, `--force-rebuild`, and `--no-reuse-env`.

Current specs: `src/modules/dealer_orders/__integration__/dealer-marketplace-journey.spec.ts`. It covers the full multi-dealer journey: registration, KYC approval, order assignment, commission snapshot, ledger, and payout. It also checks cross-dealer isolation. It inserts a "paid" order directly through `fixtures/pg.ts` because no payment gateway is available.

`yarn test:integration` (without `:ephemeral`) runs the same Playwright config against servers you already started yourself. Set `BASE_URL` to point at them.

## Shared packages (`packages/api-client`, `packages/ui`)

```bash
cd packages/api-client && npm test
cd packages/ui && npm test
```

These use Node's built-in test runner (`node --test`) and Node's built-in TypeScript type stripping, so they need no `npm install`. They need Node 22.18 or newer; the repo uses 24.

## Dealer portal (`apps/dealer-portal`)

```bash
cd apps/dealer-portal
npm install
npm test            # node --test tests/*.test.mjs
npm run lint
```

- Tests are `.mjs` files in `apps/dealer-portal/tests/`. They import the app's `.ts` sources directly, using Node's type stripping.
- `npm install` is needed only so that `@gift/api-client` and `@gift/ui` resolve. These are `file:` dependencies on `../../packages/*`. The tests use no third-party packages.
- Some tests (`profile-acl-contract`, `staff-acl-contract`) read source files from `apps/mercato/src/modules/...`. That checks that the portal and the backend agree on ACL features. These tests therefore need the whole repo checked out, not just this app.
- There is no committed `package-lock.json`, because the root `.gitignore` excludes lockfiles. That means `npm ci` cannot be used.

## Storefront (`apps/storefront`)

```bash
cd apps/storefront
npm install
npm run typecheck
npm run lint
```

There are no unit tests. There is one Playwright end-to-end suite, `apps/storefront/__integration__/storefront-and-admin.spec.ts`, with 29 tests covering the Phase 1 checklist. It runs against **live local servers**:

```bash
# terminal 1
cd apps/mercato && yarn dev:classic          # admin + API on :3000
# terminal 2
cd apps/storefront && npm run dev            # storefront on :3100
# terminal 3
cd apps/storefront
npx playwright install chromium              # once
BASE_URL=http://localhost:3100 ADMIN_URL=http://localhost:3000 npx playwright test
```

It logs in as the seeded superadmin and expects the seeded catalog, for example the `gift-personalised-photo-mug` product. Only run it against a local or disposable database, never the shared dev database.

## Mobile (`apps/mobile`)

```bash
cd apps/mobile
npm install         # apps/mobile/.npmrc sets legacy-peer-deps (see below)
npm test            # jest with the jest-expo preset
npm run typecheck   # tsc --noEmit
```

- Tests live in `src/**/__tests__/`. They cover UI primitives (Button, Input, Badge, etc.), API error mapping, and navigation helpers.
- The first run takes about 80 s while Babel fills its transform cache. Later runs take about 20 s.
- `apps/mobile/.npmrc` sets `legacy-peer-deps=true`. Without it, a plain `npm install` on npm 11 fails with `ERESOLVE` on an *optional* peer dependency (`@vinejs/vine`, declared by `@hookform/resolvers`) that the app never uses.

## What CI runs

CI is AWS CodeBuild, driven by `buildspec.yml` at the repo root. It runs on every push to `main` with the `nodejs: 24` runtime. All tests run in the `pre_build` phase. If any command fails, CodeBuild stops before the `build` phase, so no Docker image is built or pushed and ECS is not redeployed.

In order:

1. `apps/mercato`: `yarn install --frozen-lockfile`, then `yarn test --no-coverage --passWithNoTests`
2. `packages/api-client`: `npm test`
3. `packages/ui`: `npm test`
4. `apps/dealer-portal`: `npm install --no-audit --no-fund --ignore-scripts`, then `npm test`

CI does **not** run: the mercato integration suite (it needs Docker-in-Docker and a production build), any typecheck or lint, the storefront end-to-end suite, or the mobile tests. See the recommendations below.

## Team testing rules

These apply to every change, from now on:

1. **Every behaviour change ships with unit tests.** A pull request that changes what code does must add or update tests that would fail without the change.
2. **Every new API endpoint gets permission and tenant-isolation tests.** At minimum, cover:
   - a caller without the required ACL feature gets 403;
   - an unauthenticated caller gets 401;
   - a caller from another tenant or organization (or another dealer) cannot read or change the record and gets 404 or 403, never the data;
   - scope (`tenantId`/`organizationId`) comes from the session, never from the request body.
3. **Every new user journey gets an end-to-end spec.** Backend journeys go in `apps/mercato/src/modules/<id>/__integration__/*.spec.ts` and run under the ephemeral harness. Storefront journeys go in `apps/storefront/__integration__/`.
4. **Every bug fix starts with a reproducing test.** Write a test that fails because of the bug, then fix the bug and watch the test pass. Commit both together.
5. **Tests must pass on Windows, macOS and Linux.** Do not compare raw OS paths against strings containing `/`. Normalise them with `split(path.sep).join('/')`, or compare only base names.
6. **Never point a test at a real database or the deployed dev environment.** Use mocks for unit tests and the ephemeral harness for integration tests.

## Known gaps and recommendations

- **No lockfiles for the npm apps.** The root `.gitignore` excludes `package-lock.json`, so `dealer-portal`, `storefront` and `mobile` install whatever versions their semver ranges allow at that moment. CI uses `npm install` for the dealer portal for this reason. Recommendation: commit a lockfile for each npm app (remove the `.gitignore` rule) and switch CI to `npm ci`.
- **Dealer portal `typecheck` fails.** TypeScript resolves `@gift/ui` to its real path, `packages/ui/src/*.tsx`, and looks for `react`, `lucide-react` and `@radix-ui/*` from there. `packages/ui` has no `node_modules`, so those imports fail with TS2307 and TS2875. The storefront only imports `@gift/ui/money`, which has no React, so it is not affected. Possible fixes: install `packages/ui`'s own dependencies, set `"preserveSymlinks": true` in `apps/dealer-portal/tsconfig.json`, or move to npm/yarn workspaces. This is not fixed yet.
- **Storefront typecheck and lint could join CI.** They pass on a clean install today. They are not in CI yet because, without a lockfile, a new TypeScript or `eslint-config-next` release could start failing them and block backend deploys for reasons unrelated to the backend. Add them once lockfiles are committed.
- **Mobile tests could join CI** after lockfiles exist. They pass and need no device or simulator, but `npm install` for Expo adds about 1–5 minutes to every backend deploy. A separate CodeBuild project, or a GitHub Actions workflow triggered by `apps/mobile/**` changes, would keep backend deploys fast.
- **Integration tests are not in CI.** The ephemeral harness needs Docker and a production build. CodeBuild can run Docker, since the build already does `docker build`, so it is feasible, but it should be a separate job or a nightly run rather than part of the deploy pipeline.
