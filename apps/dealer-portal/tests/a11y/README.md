# Dealer-portal accessibility regression suite

```bash
cd apps/dealer-portal
npx playwright install chromium     # once per machine
npm run test:a11y                   # next build + next start + mock API + the suite (~5 min)
A11Y_SKIP_BUILD=1 npm run test:a11y # reuse an existing .next production build
A11Y_DEV=1 npm run test:a11y        # against `next dev` (iterate faster on fixes)
```

What runs (Chromium, Playwright + `@axe-core/playwright`):

- `pages.spec.mjs` — axe-core, WCAG 2.0/2.1/2.2 A + AA tags, on all 18 pages in ~65 key states
  (loaded / empty / load-error / form-validation errors / dialogs / success), in **light and dark**
  colour schemes. The full list of states is `CASES` in `helpers.mjs`.
- `keyboard.spec.mjs` — checks axe can't do: skip link, visible focus on every tab stop, keyboard-only
  login, focus moves to the first invalid field / to the result after submit, dialog focus trap and
  focus return, focus kept after paging/deactivation/tag removal, `role=status` announcements,
  no page-level horizontal scroll at 320 px, mobile menu (`aria-expanded`, Escape), reduced motion.

No real backend is used. `mock-api.mjs` stands in for apps/mercato and the portal's
`OM_API_BASE_URL` points at it. The `auth_token` cookie value picks the scenario:
`<persona>[.<variant>]` with persona `owner | staff | pending | underreview | rejected | notdealer |
noprofile` and variant `loaded | empty | error`. The tests set the cookie; you can do the same in a
browser to look at a state by hand (start `node tests/a11y/mock-api.mjs`, then
`OM_API_BASE_URL=http://127.0.0.1:3299 npx next dev --port 3210`, open `http://localhost:3210`).

Ports: portal 3210 (`A11Y_PORT`), mock 3299 (`MOCK_API_PORT`). The run fails fast if either port
is taken; `A11Y_REUSE=1` makes it use servers you already started there instead. On Windows,
stopping a `next dev` shell does not always kill its node child — check the port if a run is odd.
Use `localhost`, not `127.0.0.1`, with `next dev` (Next blocks dev resources from other origins
and the page never hydrates).

When adding a page or state: add a `CASES` entry (and mock data in `mock-api.mjs` if needed).
Automated checks catch roughly a third of WCAG issues — they do not replace a screen-reader pass.
