# WS-F — Dealer portal accessibility pass (TASK-17's open gap)

Branch `m1/ws-f` (from `milestone-1-hardening`). Not pushed. Scope: `apps/dealer-portal/**`, `packages/ui/**`.

## Status

**Done, with a short list of open items.** All 18 dealer-portal pages were audited in a real browser
(Chromium via Playwright) against a local mock backend, in 65 key states, in light and dark mode,
against WCAG 2.2 AA. axe-core plus scripted keyboard, focus, live-region, reflow and motion checks.

- **Before:** 55 of 130 page-state scans failed axe (65 states × 2 colour schemes). The rules hit
  were `color-contrast`, `link-in-text-block` and `label`. The capabilities form also failed the
  harness's own check: its number fields never exposed `aria-invalid`.
- **After:** 160/160 automated checks pass (130 axe scans + 30 keyboard/focus/reflow checks).
  They run against a production build (`next start`).
- Existing checks still pass: `npm test` 300/300, `npm run typecheck` clean, `npm run lint` 0 errors
  (2 warnings that were already there), `npm run build` succeeds. `packages/ui` tests 15/15.
- The TASK-17 line "Check desktop/mobile, keyboard, labels, focus/error announcements and
  responsive tables" can be ticked for **automated and scripted** coverage. A real screen-reader
  pass (NVDA/VoiceOver) has not been done. See "Not done".

## What changed (files + why)

Commits on `m1/ws-f`:

| Commit | Subject |
|---|---|
| `c0ecbe5` | fix(ui): accessibility fixes in shared @gift/ui components |
| `918baf9` | fix(dealer-portal): contrast tokens, landmarks and skip-link target |
| `54e54aa` | fix(dealer-portal): accessible auth and onboarding forms |
| `6212a61` | fix(dealer-portal): accessible portal pages (orders, profile, staff, finance) |
| `74405a9` | test(dealer-portal): automated accessibility regression suite (axe + keyboard) |
| (this file) | docs: WS-F accessibility handoff |

Fixes went into shared components first where possible.

**`packages/ui/src`**
- `form.tsx`
  - `Field` now fills in `aria-describedby` (the error, otherwise the hint) and `aria-invalid` on its
    child control, unless the caller already set them. Many callers had not, so hints and errors
    were not linked to their inputs.
  - Inputs, selects and textareas get a danger-coloured border when `aria-invalid`.
  - New `focusFirstInvalid(form)` helper, exported from `index.tsx`.
- `dialog.tsx`: `DialogContent` remembers which element opened the dialog and returns focus to it
  on close. Radix only does this for `<DialogTrigger>`. Every dialog in the app is controlled, so
  focus was falling to `<body>`.
- `pagination.tsx`
  - Uses `aria-disabled` instead of `disabled`, so paging onto the first or last page no longer
    drops focus.
  - The "Page X of Y · N results" text is a polite live region.
- `feedback.tsx`: `EmptyState` and `SessionExpired` take a `headingLevel` prop. The default is h2;
  it was a hard-coded h3 that skipped heading levels.
- `button.tsx`: primary and danger buttons now get darker on hover (`hover:brightness-90`). The old
  hover made them lighter, which dropped text contrast to 3.35–4.33:1.

**`apps/dealer-portal/src`**
- `app/globals.css`: design-token contrast fixes (values below in the 1.4.3 and 1.4.11 findings).
  These change how the app looks slightly: the brass is a little darker and input borders are
  darker.
- `components/layout/PortalShell.tsx`
  - `<main tabIndex=-1>`, so the skip link actually moves focus.
  - Escape closes the mobile drawer and returns focus to the toggle.
  - The drawer element is always rendered (with `hidden` when closed), so `aria-controls` always
    points at something.
- `app/(auth)/layout.tsx`, `app/(onboarding)/layout.tsx`: the brand bar is a `<header>`;
  `<main id="main">`.
- `components/auth/LoginForm.tsx`: login error messages now match what the backend actually said.
  The backend answers a wrong password with 401. The api-client turned that into "Your session has
  expired. Please sign in again." Now:
  - 400 → "Enter a valid email address and your password."
  - 401 → "Invalid email or password."
  - 403 → "This account is not authorized to use the dealer portal."
- `components/auth/ForgotPasswordForm.tsx`, `onboarding/RegisterForm.tsx`, `onboarding/ResubmitForm.tsx`
  - When the form is replaced by its result, focus moves to the result heading.
  - When validation fails, focus moves to the first invalid field.
- `components/onboarding/DocumentUploadPanel.tsx` (WS-B's area — kept to markup plus one small
  behaviour change):
  - Rows use h2 headings.
  - The file input is linked to its accepted-types hint and its error, and gets `aria-invalid`.
  - Upload results are announced through an always-present status region.
  - **Behaviour change:** after a successful upload the panel refreshes in the background
    (`fetchStatus()` instead of `load()`). Before, it swapped the whole panel for a spinner. That
    unmounted the row, so its success message never showed and focus was lost.
  - The file input fits at 320px.
  - "Download" and "Cancel" carry screen-reader-only context (which document; "upload").
- `components/onboarding/ApplicationStatus.tsx`: the session-ended state has an h1. The CTA hover
  is fixed.
- Pages keep their h1 in loading, error, forbidden and session-expired states: `ProfileView`,
  `CapabilitiesEditView`, `StaffListView`, `OrderDetailView`, `OrdersListView`, `EarningsView`,
  `LedgerView`.
- `components/profile/*`
  - `ProductTypeTagsInput` takes an `id`, so the label actually names the input. Before, the label
    pointed at an id that didn't exist.
  - The tag remove buttons are 24×24.
  - Removing a tag keeps focus in the input.
  - `MultiSelectCheckboxGroup` is a proper `fieldset`/`legend` with an associated error. It was
    wrapped in a `<label for>` that pointed at nothing.
  - `CapabilitiesForm` wires up errors and hints.
  - `CapabilitiesEditView` focuses the first invalid field and announces "Capabilities saved".
- `components/staff/*`
  - The invite and deactivate notices go through an always-present `role=status` region.
  - After deactivating someone, focus moves to the confirmation.
  - `autoFocus` was removed from the invite email field. Radix already focuses it, and `autoFocus`
    stopped focus from returning to the "Invite staff" button.
- `components/orders/*`
  - Status updates are announced ("Status updated to Acknowledged.").
  - The orders list keeps showing the previous page while the next one loads
    (`placeholderData: keepPreviousData`). Before, the pager unmounted on every page change and
    focus was lost.
  - The decorative "←" is hidden from screen readers.
- All four data tables get screen-reader-only `<caption>`s.
- Links inside sentences are always underlined: earnings, ledger, capabilities, register and
  resubmit.

**Tests and tooling** (`apps/dealer-portal/tests/a11y/`, see its `README.md`)
- `mock-api.mjs`: a test-only stand-in for apps/mercato. Payloads follow `API-CONTRACTS.md` and
  `packages/api-client` types. The `auth_token` cookie picks the scenario:
  - persona: `owner`, `staff`, `pending`, `underreview`, `rejected`, `notdealer` or `noprofile`;
  - variant: `loaded`, `empty` or `error`.
- `pages.spec.mjs` and `helpers.mjs`: the axe scan of every case in `CASES`, in light and dark.
- `keyboard.spec.mjs`: scripted manual checks.
- `playwright.config.mjs`: by default builds and runs `next start` on port 3210, with the mock on
  port 3299.
- `package.json`: adds the `test:a11y` script and devDependencies `@playwright/test` ^1.65.1 and
  `@axe-core/playwright` ^4.14.0. The `test` glob `tests/*.test.mjs` does not pick up the a11y
  files.

## Commands run and exact results

All commands were run in `apps/dealer-portal` of this worktree unless noted.

| Command | Result |
|---|---|
| `npm install`; `npm install --legacy-peer-deps` in `packages/ui` | ok |
| `npm install --save-dev @playwright/test @axe-core/playwright`; `npx playwright install chromium` | ok (browser goes to the user's `%LOCALAPPDATA%\ms-playwright`) |
| Baseline (fixes stashed): `A11Y_DEV=1 npx playwright test -c tests/a11y/playwright.config.mjs` (axe pages only, light + dark) | **67 failed / 63 passed**: 55 axe failures (rules `color-contrast`, `link-in-text-block`, `label`), plus 12 failures from harness selectors and the capabilities `aria-invalid` gap |
| After fixes, dev server: same command (axe + keyboard specs) | **160 passed** |
| After fixes, production: `npm run test:a11y` (`next build` + `next start`) | **160 passed (2.3m)** |
| `npm test` | **300 pass / 0 fail** |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors, 2 warnings (`no-location-assign-relative-destination` in `LogoutButton.tsx` and `ResetPasswordForm.tsx`; both were there before and are in files this work didn't touch) |
| `npm run build` | succeeds, 18 app routes + 3 API routes |
| `packages/ui`: `npm test` | 15/15 |

## Findings (by WCAG 2.2 criterion)

Severity:
- **High** blocks or misleads users of assistive technology on a core flow.
- **Med** is a real barrier with a workaround.
- **Low** is polish or best practice.

| # | Criterion | Where | Finding | Sev | Status |
|---|---|---|---|---|---|
| 1 | 1.4.3 Contrast (minimum) | every page, light mode | Brass text and links on white measured **4.04:1** (3.76:1 on muted rows). White text on primary buttons measured **3.92:1**. White on success badges measured **4.26:1**. Success text on muted measured 4.06:1. | High | **Fixed**: tokens changed to primary L 0.53 (5.42:1 as text, 5.26:1 under white) and success L 0.52 (≥ 4.56:1). |
| 2 | 1.4.3 | all primary and danger buttons and CTA links | The hover state made the background *lighter*: 3.35–4.33:1. | Med | **Fixed**: hover now darkens. |
| 3 | 1.4.1 Use of colour | earnings, ledger, capabilities, register, resubmit | Links inside sentences were shown only by colour: 1.61:1 against the surrounding text in light mode, 1.02:1 in dark. | Med | **Fixed**: always underlined. |
| 4 | 1.4.11 Non-text contrast | every form field, light + dark (found by manual calculation; axe doesn't check borders) | Input, select and textarea borders measured **1.87:1** (light) and **1.76:1** (dark). | Med | **Fixed**: now 3.64:1 (light) and 3.49:1 (dark) against the surface. They are only 3.03–3.19:1 against `surface-muted`. |
| 5 | 3.3.1 Error identification | login | A wrong password showed **"Your session has expired. Please sign in again."** | High | **Fixed** in `LoginForm`. The root cause (the generic 401 text in `packages/api-client`) is outside this scope. See "Actions". |
| 6 | 1.3.1, 4.1.2 Name/role/value | `/profile/capabilities` | The "Product types" label pointed at a non-existent id, so the input had no name (axe `label`). The checkbox groups had a `<label for>` pointing at nothing, plus a duplicate legend. | High | **Fixed** |
| 7 | 1.3.1, 3.3.1 | capabilities number fields, order status note, login, forgot and reset fields | Errors and hints were not linked to their fields; `aria-invalid` was missing. | Med | **Fixed** centrally in `Field`. |
| 8 | 3.3.1, 2.4.3 | register, resubmit, capabilities, invite dialog | After failed validation, focus stayed on the submit button, with up to 9 alerts read at once. | Med | **Fixed**: focus moves to the first invalid field, which is described by its error. |
| 9 | 2.4.3 Focus order | staff invite and deactivate dialogs | On close, focus went to `<body>` (Radix only restores focus to a `DialogTrigger`). After deactivating someone, the row's button disappeared. | High | **Fixed**: the shared `DialogContent` restores focus; after deactivation, focus moves to the confirmation. |
| 10 | 2.4.3 | orders, earnings, ledger pagination | `disabled` on the first or last page dropped focus. On orders, the whole pager unmounted while the next page loaded. | Med | **Fixed** |
| 11 | 2.4.3, 4.1.3 | forgot-password, register, resubmit success; document upload; tag removal | The control that had focus was removed and focus went to `<body>`. The upload success message never appeared because the panel was replaced by a spinner. | Med | **Fixed** |
| 12 | 4.1.3 Status messages | staff notices, capabilities saved, order status change, upload result, page change | Live regions were inserted together with their text, which screen readers announce unreliably, or there was no announcement at all. | Med | **Fixed**: always-present `role=status` regions. |
| 13 | 2.4.1 Bypass blocks | portal shell | The skip-link target `<main>` wasn't focusable, so the link only scrolled. | Med | **Fixed** |
| 14 | 1.3.1, 2.4.6 Headings | profile, capabilities, staff, order detail (loading/error); orders, earnings, ledger (forbidden or session expired); register "incomplete link"; not-found; document rows; empty states | Pages had no h1 in these states, or heading levels were skipped (h1→h3). | Med | **Fixed** |
| 15 | 2.1.1 Keyboard, 4.1.2 | mobile nav | No Escape to close; `aria-controls` pointed at a missing element while closed. | Low | **Fixed** |
| 16 | 1.4.10 Reflow | `/onboarding/documents` at 320px | The page was 357px wide; the native file input overflowed. | Med | **Fixed**. All 12 tested pages now have no page-level horizontal scroll at 320px. Data tables scroll inside their own container, which the criterion allows. |
| 17 | 2.5.8 Target size (min) | capabilities tag remove ×; upload "Cancel" | The remove button was about 12×12px; "Cancel" had text-only height. | Low | **Fixed**: 24×24, and Cancel has padding. |
| 18 | 1.3.1 | earnings, ledger, orders, staff tables | Tables had no accessible name. | Low | **Fixed**: screen-reader-only captions. |
| 19 | 2.4.4 Link purpose | document rows | Several identical "Download" links. | Low | **Fixed**: screen-reader-only document name added. |
| 20 | Landmarks (best practice) | auth and onboarding shells | The brand bar sat outside any landmark. | Low | **Fixed**: `<header>`. |
| 21 | 2.5.3 Label in name | `/onboarding/documents` file inputs | The native control shows "Choose file", but its accessible name is "Upload GST certificate". Speech users saying "click Choose file" may not reach it. | Low | **Not fixed**. Needs a custom file button; that is a visual-design decision in WS-B's area. |
| 22 | 4.1.3 / semantics | `/login?reason=signed-out` and `password-updated` | Neutral notices use the red `ErrorNotice` with `role=alert`. | Low | **Not fixed**. A design decision; recommend a neutral notice component. |
| 23 | 4.1.3 (noise) | all forms | Every field error is its own `role=alert`, so one bad submit fires many alerts. Focus now lands on the first error, so the alerts are redundant. | Low | **Not fixed**: it changes announcements app-wide. Recommendation: remove `role=alert` from the per-field error `<p>` in `Field` and rely on focus plus `aria-describedby`. |

Checked and found OK:
- `lang="en-IN"`; page `<title>`s on every route.
- `scope="col"` on table headers.
- `aria-current` in the nav.
- Visible focus ring on every tab stop. Checked on login, dashboard, orders, capabilities and
  register.
- The dialog focus trap.
- Reduced motion: the global `prefers-reduced-motion` rule really does stop animation.
- Dark-mode contrast for all text tokens. The only dark-mode failure was link-in-text-block.
- `autocomplete` on credential fields, and no paste blocking (3.3.8).
- No sticky headers, so focus is never obscured (2.4.11).

## Not done and why

- **No real screen-reader or assistive-technology pass** (NVDA, JAWS, VoiceOver, TalkBack). It
  can't be done headless overnight. Automated plus scripted checks cover the measurable criteria
  only.
- **1.4.12 Text spacing and 1.4.4 resize** were not tested on their own. The 320px reflow check
  stands in for 400% zoom.
- **Only Chromium.** Firefox and WebKit were not run.
- **Not run against the real backend.** The mock reproduces the documented contracts, but any field
  the real backend returns differently would not be caught.
- **Not wired into CI.** WS-D owns CI. The suite needs a browser
  (`npx playwright install chromium`) and about 3 minutes plus the build time.

## Actions the human must take

1. Review the token change visually: brass L 0.60→0.53, success L 0.56→0.52, input borders
   darker. Check it is acceptable for the brand. Any replacement must stay ≥ 4.5:1 as text and
   under white text, and ≥ 3:1 for borders. Re-run `npm run test:a11y` to confirm.
2. Decide the three "Not fixed" design items (21–23 above).
3. Consider fixing `packages/api-client`'s `messageFor(401)`. It assumes every 401 means an expired
   session, which is wrong for login (and possibly other public forms). I worked around it only in
   `LoginForm`.
4. If the suite should run in CI, add `npx playwright install --with-deps chromium &&
   npm run test:a11y` in `apps/dealer-portal` (coordinate with WS-D).
5. Do a short manual screen-reader smoke test of login → orders → order detail status update →
   staff invite with NVDA + Chrome.
6. Merge note: WS-B also edits `src/app/(onboarding)/**`. My changes in
   `components/onboarding/*` are mostly attributes and markup. The one behaviour change is the
   background refresh after upload in `DocumentUploadPanel`. Expect small, easy conflicts.

## Risks

- **`Field` now auto-adds `aria-describedby`/`aria-invalid`** to native, `Input`, `Select` and
  `Textarea` children that don't set them. That is additive, and callers that set the props
  explicitly are unchanged. The storefront doesn't import `Field` today (check before it does).
- **`DialogContent` now handles `onCloseAutoFocus` itself.** Callers that pass their own handler
  and call `preventDefault()` keep full control.
- **`Pagination` uses `aria-disabled`, not `disabled`.** Clicks on the first or last page are
  ignored in the handler, so the behaviour is the same. The look is the same (opacity 50%).
- **The orders list now shows the previous page while the next one loads** (`keepPreviousData`).
  There is no spinner for that fraction of a second. This is intended.
- **Upgrade warning:** `next dev` refuses dev resources from `127.0.0.1` (only `localhost` works).
  On Windows, stopping a dev shell can leave its node child running on the port. The config now
  fails fast instead of silently reusing a stale server (`A11Y_REUSE=1` to opt in).
- **New devDependencies** add a `playwright` package to the dealer-portal install, but no browser
  download during install. The Vercel/production build is unaffected beyond install size.
