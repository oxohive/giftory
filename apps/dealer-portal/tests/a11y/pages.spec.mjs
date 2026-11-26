/**
 * axe-core (WCAG 2.2 A/AA) scan of every dealer-portal page in its key states, in light and dark
 * colour schemes. Data comes from tests/a11y/mock-api.mjs — see that file for how the
 * `auth_token` cookie selects a persona/variant. Run with `npm run test:a11y`.
 */
import { expect, test } from '@playwright/test'
import { CASES, signIn, auditPage, waitForSettled } from './helpers.mjs'

for (const scheme of ['light', 'dark']) {
  test.describe(`axe (${scheme})`, () => {
    test.use({ colorScheme: scheme })

    for (const c of CASES) {
      test(`${c.name}`, async ({ page, context }) => {
        if (c.token) await signIn(context, c.token)
        await page.goto(c.path)
        if (c.expectUrl) await expect(page).toHaveURL(c.expectUrl)
        await waitForSettled(page, c.ready)
        if (c.act) await c.act(page)
        await auditPage(page, `${c.name} [${scheme}]`)
      })
    }
  })
}
