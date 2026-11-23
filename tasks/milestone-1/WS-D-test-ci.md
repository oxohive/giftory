# WS-D: Test tooling and CI (handoff)

Branch: `m1/ws-d` (based on `milestone-1-hardening`). Worktree: `C:\Users\danie\Gift-App-wt\ws-d`. Nothing pushed.

## Status

**Done.** All four tasks are complete.

| Suite | Result on Windows (Node 24.20.0, npm 11.19.0) |
|---|---|
| `apps/mercato` `yarn test` | 638/638 pass (64 suites). Was 637/638 before the fix. |
| `apps/dealer-portal` `npm test` | 300/300 pass. |
| `packages/api-client`, `packages/ui` `npm test` | 8/8 and 15/15 pass. |
| `apps/mobile` `jest` | 44/44 pass (9 suites). |
| `apps/mobile` `tsc --noEmit` | 0 errors. |

CI (`buildspec.yml`) now also runs the shared-package tests and the dealer-portal tests before the Docker build. `docs/testing.md` is new.

## What changed

| Commit | File | Why |
|---|---|---|
| `fa92166` | `apps/mercato/src/modules/commissions/components/__tests__/snapshotsAreReadOnlyInTheUi.test.ts` | The test called `file.endsWith('order-commission-tab/widget.client.tsx')` on paths built with `path.join`. On Windows those paths use `\`, so the widget was never found and the test failed. The fix converts each collected path to forward slashes (`full.split(sep).join('/')`) when the sources are gathered. All later lookups then work on every OS. This was the only failure in the suite. |
| `866fc28` | `buildspec.yml` | Adds the `packages/*` and `apps/dealer-portal` unit tests to CI. Explained line by line below. |
| `77aae54` | `apps/mobile/.npmrc` (new) | A plain `npm install` in `apps/mobile` failed on a clean checkout (details under task 3). The new file sets `legacy-peer-deps=true`, with a comment saying why. |
| `ee6857a` | `docs/testing.md` (new) | Explains how to run every suite and what each one needs, what CI runs, the current results, the team testing rules, and known gaps. |
| (this commit) | `tasks/milestone-1/WS-D-test-ci.md` | This handoff. |

### Task 1: search for the Windows path bug

I searched for the same kind of bug, meaning `endsWith`, `includes`, `startsWith`, `split` or regex tests on OS paths compared against strings that contain `/`. I covered all of `apps/mercato/src`, including non-test code and the `__integration__` Playwright spec and fixtures, plus `apps/dealer-portal/tests` and `apps/dealer-portal/src`. Nothing else was broken:

- The other `endsWith(...)` calls on paths compare base names only, such as `'CommissionRulesTable.tsx'` and `'detail.ts'`. Those work on every OS.
- `apps/dealer-portal/tests/profile-no-identity-edit.test.mjs` already uses `/lib[\\/]features[\\/]profile[\\/]api\.ts$/`, which is portable.
- The `/`-based `testPathIgnorePatterns` in `apps/mercato/jest.config.cjs` are fine, because Jest rewrites them for Windows. Confirmed: no `__integration__` spec was picked up on Windows.
- The other `path.includes('//')` and `pathname.startsWith(...)` calls work on URL paths, not filesystem paths.

### Task 2: `buildspec.yml` additions, line by line

All new lines are in `pre_build`, directly after the existing mercato test block. Deploy steps (`build`, `post_build`) are unchanged.

```yaml
      # Shared packages ... no install.                       (comment)
      - echo "=== Running tests (packages/api-client, packages/ui) ==="   # log header
      - cd packages/api-client                                # enter package (path relative to $CODEBUILD_SRC_DIR, where the previous block left us)
      - npm test                                              # node --test tests/*.test.mjs; exits 1 on any failure
      - cd $CODEBUILD_SRC_DIR/packages/ui                     # enter second package
      - npm test                                              # same runner
      - cd $CODEBUILD_SRC_DIR                                 # back to repo root (same pattern as the mercato block)

      # Dealer portal ... (comment explaining npm install vs npm ci and --ignore-scripts)
      - echo "=== Running tests (dealer-portal) ==="           # log header
      - cd apps/dealer-portal
      - npm install --no-audit --no-fund --ignore-scripts     # see below
      - npm test                                              # node --test tests/*.test.mjs (300 tests)
      - cd $CODEBUILD_SRC_DIR
```

- **Why the build stops on a failure:** a failing command fails the `pre_build` phase. CodeBuild then skips `build` and `post_build`, so there is no image build, no ECR push and no ECS deploy. The existing mercato tests already rely on this. I checked that `npm test` exits 1 when a test fails, for both the dealer portal and `packages/ui`. I did that by adding a deliberately failing test in a throwaway copy.
- **Why `npm install` and not `npm ci` (as the brief asked):** `npm ci` is impossible. The root `.gitignore` has a `package-lock.json` rule, so no npm app has a committed lockfile. On a clean checkout, `npm ci` fails with `EUSAGE: The npm ci command can only install with an existing package-lock.json` (reproduced).
- **Why `--ignore-scripts`:** the tests import only Node built-ins, the app's own `.ts` files, and the two `file:` packages (`@gift/api-client`, `@gift/ui`). No install script is needed. Without a lockfile, the dependency versions float. Skipping lifecycle scripts keeps third-party postinstall code from running in a job that holds ECR and ECS deploy permissions. `--no-audit --no-fund` only reduce noise and network calls.
- **Why the packages need no install:** `packages/api-client` and `packages/ui` tests import only their own `.ts` files and Node built-ins.
- **Node version:** the buildspec declares `runtime-versions: nodejs: 24`, unchanged. The `.ts` imports rely on Node's built-in type stripping, which is on by default in Node 22.18 and later and in all Node 24 releases.
- **Dealer-portal tests read mercato source.** `profile-acl-contract` and `staff-acl-contract` read `apps/mercato/src/modules/...`. CodeBuild checks out the whole repo, so this works.
- **Cost:** about 1 minute for the dealer-portal `npm install` (395 packages) and about 3 s for the tests.
- **Simulation:** I took the four new command groups from the YAML, parsing it with the `yaml` package (which also proves the file parses). I ran them with `bash -e` in a clean `git archive HEAD` extraction with `CODEBUILD_SRC_DIR` set. They passed: 8, 15 and 300 tests.
- **Storefront typecheck and lint were not added**, although both pass on a clean install today. See Decisions.

### Task 3: mobile

- `npm install` in `apps/mobile` failed on npm 11.19.0:
  `ERESOLVE ... Found: @vinejs/vine@undefined ... peerOptional @vinejs/vine@"^2.0.0 || ^3.0.0 || ^4.0.0" from @hookform/resolvers@5.9.2`.
  The peer is optional and the app does not use it. This looks like a quirk of the npm resolver. I added `apps/mobile/.npmrc` with `legacy-peer-deps=true`. I then verified a fully clean install in a scratch copy: 1290 packages, about 2.5 min. In that copy, `npm test` gave 44/44 and `npm run typecheck` exited 0.
- `jest`: 9 suites, 44/44 pass. The first run took about 82 s (cold Babel cache) and later runs about 20 s. No warnings or console errors.
- `tsc --noEmit`: exit 0, no errors.
- I found no app bugs.

## Commands run and exact results

| Command (cwd) | Result |
|---|---|
| `yarn test --no-coverage` (`apps/mercato`, before fix) | `Tests: 1 failed, 637 passed, 638 total`. Failing test: "the order-commission tab widget renders no edit/delete affordance" (`expect(widget).toBeDefined()`). |
| `yarn test --no-coverage` (`apps/mercato`, after fix) | `Test Suites: 64 passed, 64 total; Tests: 638 passed, 638 total` |
| `npm test` (`apps/dealer-portal`, junctioned deps) | `tests 300, pass 300, fail 0` |
| `npm test` (`apps/dealer-portal`, no `node_modules`) | Fails with `ERR_MODULE_NOT_FOUND '@gift/api-client'` and `'@gift/ui'`. Those are the only missing modules. |
| `npm ci` (clean archive, `apps/dealer-portal`) | `npm error code EUSAGE`: no lockfile |
| `npm install --no-audit --no-fund` then `npm test` (clean archive, `apps/dealer-portal`) | Added 395 packages in about 1 min; 300/300 pass |
| `npm run typecheck` (`apps/dealer-portal`, clean and junctioned) | **Fails**: TS2307/TS2875 in `packages/ui/src/*.tsx` (`react`, `lucide-react`, `@radix-ui/react-label` not found). Pre-existing; not a test file, so not fixed. |
| `npm run lint` (`apps/dealer-portal`, clean) | 0 errors, 2 warnings (`no-location-assign-relative-destination`) |
| `npm install`, `npm run typecheck`, `npm run lint` (clean archive, `apps/storefront`) | Install OK (415 packages); typecheck exit 0; lint exit 0 |
| `npm test` (`packages/api-client`, `packages/ui`, no install) | 8/8, 15/15 |
| CI simulation of the new buildspec lines (clean archive, `bash -e`) | exit 0 (8, 15 and 300 pass) |
| A deliberately failing test added in a throwaway copy, then `npm test` | exit 1 (dealer-portal and `packages/ui`) |
| `npm install --no-audit --no-fund` (`apps/mobile`, before `.npmrc`) | exit 1, `ERESOLVE` (see above) |
| Clean `npm install` (scratch copy of `apps/mobile`, with `.npmrc`) | Added 1290 packages, exit 0 |
| `npx jest` (`apps/mobile`) | `Test Suites: 9 passed; Tests: 44 passed, 44 total` |
| `npx tsc --noEmit` (`apps/mobile`) | exit 0, no output |
| `docker info` | Daemon not running (`dockerDesktopLinuxEngine` pipe missing), so the mercato ephemeral integration suite was not run |

## Decisions made and reasoning

1. **Normalise paths when sources are collected, not at each lookup.** One change fixes every current and future `endsWith('dir/file')` lookup in that test.
2. **`npm install --ignore-scripts` rather than committing a lockfile.** Committing lockfiles means removing a repo-wide `.gitignore` rule. That is a dependency-policy decision, `.gitignore` is outside my scope, and other workstreams may be touching it. I chose the minimal option that works today and recorded the lockfile change as a recommendation.
3. **Shared-package tests added to CI.** They need no install, finish in under a second, and cover the money and date helpers both frontends depend on. That is high value for two lines of YAML.
4. **Storefront typecheck and lint left out of CI**, although they pass today. Without a lockfile, a new `typescript@^6` or `eslint-config-next@^16` release could start failing them and block **backend** deploys, since this pipeline only deploys mercato. The dealer-portal tests do not have that risk, because they load no third-party code. Revisit once lockfiles exist.
5. **Mobile: `.npmrc` `legacy-peer-deps=true`** rather than pinning `@hookform/resolvers` or other dependency surgery. It is a config-only change that is easy to reverse. Jest and tsc both pass with the resulting tree.
6. **Mobile tests not added to the backend CI.** Recommendation below.

## Not done and why

- **Mercato integration suite (`yarn test:integration:ephemeral`) not run.** The Docker daemon was not running on this machine, and the harness needs it. It also does a full production build. Documented in `docs/testing.md`.
- **Storefront Playwright end-to-end suite not run.** It needs live mercato and storefront servers with seeded data, and I was not allowed to start them against a real database.
- **Dealer-portal `npm run typecheck` failure not fixed.** It is a `tsconfig` or workspace problem in app config, not a test file, so it is outside my scope. Options are in `docs/testing.md`: `preserveSymlinks: true` in `apps/dealer-portal/tsconfig.json`, installing `packages/ui`'s dependencies, or npm/yarn workspaces. Recommended: try `preserveSymlinks` first, because it is one line, then confirm `next build` still works.
- No changes were made to `README.md`, `CLAUDE.md`, `docs/phase-2-status.md` or `PROGRESS.md`. Those are owned by other workstreams.

## Actions the human must take

1. **Review `buildspec.yml` before merging to `main`.** Any push to `main` runs it in production CI. The first run will show whether the dealer-portal `npm install` works on the CodeBuild image; it was verified locally only. If CodeBuild fails, look at the `=== Running tests (dealer-portal) ===` section of the log.
2. **Decide on lockfiles.** Recommended: remove `package-lock.json` from the root `.gitignore`, commit lockfiles for `apps/dealer-portal`, `apps/storefront` and `apps/mobile`, and switch the buildspec line to `npm ci --ignore-scripts`. After that, add storefront `npm run typecheck && npm run lint` to CI.
3. **Mobile tests in CI:** recommended, but as a separate job, either a second CodeBuild project or a GitHub Actions workflow triggered by `apps/mobile/**` changes, not in the deploy pipeline. They pass and need no device, but the Expo install adds about 2.5 minutes or more to each backend deploy.
4. To run the mercato integration suite locally, start Docker Desktop, then run `cd apps/mercato && yarn test:integration:ephemeral`.
5. Nothing in this branch requires migrations, secrets or infra changes.

## Risks

- **Floating versions in CI.** Without a lockfile, the dealer-portal install takes the latest versions that semver allows. The tests themselves do not load any of them, so the realistic failure modes are network or registry outages, or a broken published package that stops `npm install` itself. Either would block a deploy. Lockfiles plus `npm ci` remove most of this risk.
- **Longer CI.** The dealer-portal install adds about 1 minute to each build. The package tests add about 1 s.
- **Pre-existing, not introduced here:** if the `build` phase (`docker build`) fails, CodeBuild still runs `post_build`. Its first command (`docker push`) would fail and stop it before `aws ecs update-service`, so no bad deploy happens. Still, worth knowing.
- **Mobile `legacy-peer-deps`** also turns off npm 7+'s automatic installation of peer dependencies for that app. Today all needed peers are declared directly, and tests and tsc pass. If a future dependency relies on an auto-installed peer, it will need to be added to `package.json` explicitly.
