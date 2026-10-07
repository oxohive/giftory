# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: TC-PHASE1-CHECKLIST.spec.ts >> TC-ADMIN-003 Gift profile on product >> Gift profile card is visible when editing a product
- Location: __integration__\TC-PHASE1-CHECKLIST.spec.ts:467:3

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: locator.click: Test timeout of 90000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /sign in/i })
    - locator resolved to <button type="submit" data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-all disabled:pointer-events-none disabled:bg-bg-disabled disabled:text-text-disabled disabled:border-border-disabled disabled:shadow-none disabled:[background-image:none] [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-none focus-visible:shadow-focus aria-inv…>Sign in</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <button type="button" data-slot="button" aria-expanded="false" class="inline-flex items-center justify-center rounded-md text-sm font-medium cursor-pointer transition-all disabled:pointer-events-none disabled:bg-bg-disabled disabled:text-text-disabled disabled:border-border-disabled disabled:shadow-none disabled:[background-image:none] [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-none focus-visible:shadow-focus aria-inval…>…</button> from <div role="status" aria-live="polite" data-health="degraded" data-testid="dev-runtime-diagnostics-banner" class="fixed inset-x-3 bottom-20 z-banner flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg sm:inset-x-auto sm:right-4 sm:max-w-4xl border-status-warning-border bg-status-warning-bg text-status-warning-text">…</div> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div role="status" aria-live="polite" data-health="degraded" data-testid="dev-runtime-diagnostics-banner" class="fixed inset-x-3 bottom-20 z-banner flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg sm:inset-x-auto sm:right-4 sm:max-w-4xl border-status-warning-border bg-status-warning-bg text-status-warning-text">…</div> intercepts pointer events
    - retrying click action
      - waiting 100ms
    42 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div role="status" aria-live="polite" data-health="degraded" data-testid="dev-runtime-diagnostics-banner" class="fixed inset-x-3 bottom-20 z-banner flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg sm:inset-x-auto sm:right-4 sm:max-w-4xl border-status-warning-border bg-status-warning-bg text-status-warning-text">…</div> intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <button type="button" data-slot="button" aria-expanded="false" class="inline-flex items-center justify-center rounded-md text-sm font-medium cursor-pointer transition-all disabled:pointer-events-none disabled:bg-bg-disabled disabled:text-text-disabled disabled:border-border-disabled disabled:shadow-none disabled:[background-image:none] [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-none focus-visible:shadow-focus aria-inval…>…</button> from <div role="status" aria-live="polite" data-health="degraded" data-testid="dev-runtime-diagnostics-banner" class="fixed inset-x-3 bottom-20 z-banner flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg sm:inset-x-auto sm:right-4 sm:max-w-4xl border-status-warning-border bg-status-warning-bg text-status-warning-text">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div role="status" aria-live="polite" data-health="degraded" data-testid="dev-runtime-diagnostics-banner" class="fixed inset-x-3 bottom-20 z-banner flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg sm:inset-x-auto sm:right-4 sm:max-w-4xl border-status-warning-border bg-status-warning-bg text-status-warning-text">…</div> intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div role="status" aria-live="polite" data-health="degraded" data-testid="dev-runtime-diagnostics-banner" class="fixed inset-x-3 bottom-20 z-banner flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg sm:inset-x-auto sm:right-4 sm:max-w-4xl border-status-warning-border bg-status-warning-bg text-status-warning-text">…</div> intercepts pointer events
     - retrying click action
       - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <div role="status" aria-live="polite" data-health="degraded" data-testid="dev-runtime-diagnostics-banner" class="fixed inset-x-3 bottom-20 z-banner flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg sm:inset-x-auto sm:right-4 sm:max-w-4xl border-status-warning-border bg-status-warning-bg text-status-warning-text">…</div> intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <button type="button" data-slot="button" aria-expanded="false" class="inline-flex items-center justify-center rounded-md text-sm font-medium cursor-pointer transition-all disabled:pointer-events-none disabled:bg-bg-disabled disabled:text-text-disabled disabled:border-border-disabled disabled:shadow-none disabled:[background-image:none] [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-none focus-visible:shadow-focus aria-inval…>…</button> from <div role="status" aria-live="polite" data-health="degraded" data-testid="dev-runtime-diagnostics-banner" class="fixed inset-x-3 bottom-20 z-banner flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg sm:inset-x-auto sm:right-4 sm:max-w-4xl border-status-warning-border bg-status-warning-bg text-status-warning-text">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - status [ref=e4]:
        - generic [ref=e5]:
          - generic [ref=e6]:
            - paragraph [ref=e7]: Runtime degraded · Runtime error detected
            - paragraph [ref=e8]: "[healthz] Infrastructure probe failed { component: 'database', error: 'database healthcheck timed out' }"
          - button "Dismiss" [ref=e9] [cursor=pointer]
        - generic [ref=e10]:
          - button "Show details" [ref=e11] [cursor=pointer]
          - button "Retry" [ref=e12] [cursor=pointer]
          - button "Restart runtime" [ref=e13] [cursor=pointer]
          - button "View logs" [ref=e14] [cursor=pointer]
      - generic [ref=e16]:
        - generic [ref=e17]:
          - img "Open Mercato logo" [ref=e18]
          - heading "Open Mercato" [level=1] [ref=e19]
          - generic [ref=e20]: Access your workspace
        - generic [ref=e22]:
          - generic [ref=e23]:
            - generic [ref=e24]: Email
            - textbox "Email" [ref=e30]:
              - /placeholder: name@example.com
              - text: superadmin@acme.com
          - generic [ref=e31]:
            - generic [ref=e32]: Password
            - generic [ref=e33]:
              - textbox "Password" [active] [ref=e37]: secret
              - button "Show password" [ref=e38]
          - generic [ref=e42]:
            - checkbox "Remember me" [ref=e43]
            - generic [ref=e44]: Remember me
          - button "Sign in" [ref=e45] [cursor=pointer]
          - link "Forgot password?" [ref=e47] [cursor=pointer]:
            - /url: /reset
    - contentinfo [ref=e49]:
      - generic [ref=e50]:
        - navigation [ref=e51]:
          - link "Terms" [ref=e52] [cursor=pointer]:
            - /url: /terms
          - link "Privacy" [ref=e53] [cursor=pointer]:
            - /url: /privacy
        - generic [ref=e54]:
          - generic [ref=e55]: Language
          - combobox "Language" [ref=e56]:
            - generic: English
  - button "Open Next.js Dev Tools" [ref=e62] [cursor=pointer]
  - alert [ref=e66]
  - generic [ref=e68]:
    - generic [ref=e69]:
      - text: We use essential cookies to remember your preferences. Learn how we handle data in our
      - link "Privacy" [ref=e70] [cursor=pointer]:
        - /url: /privacy
      - text: .
    - generic [ref=e71]:
      - button "Dismiss" [ref=e72] [cursor=pointer]
      - button "Accept cookies" [ref=e73] [cursor=pointer]
```

# Test source

```ts
  1   | /**
  2   |  * TC-PHASE1-CHECKLIST
  3   |  * End-to-end coverage of the Phase 1 test checklist for the Gift-App storefront and admin.
  4   |  *
  5   |  * Pre-requisites (both servers must be running):
  6   |  *   cd apps/mercato   && yarn dev:classic   # admin + API on :3000
  7   |  *   cd apps/storefront && npm run dev        # storefront on :3100
  8   |  *
  9   |  * Run:
  10  |  *   BASE_URL=http://localhost:3100 ADMIN_URL=http://localhost:3000 npx playwright test TC-PHASE1-CHECKLIST.spec.ts
  11  |  */
  12  | 
  13  | import { test, expect, type Page } from '@playwright/test'
  14  | 
  15  | const STOREFRONT = process.env.BASE_URL ?? 'http://localhost:3100'
  16  | const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:3000'
  17  | 
  18  | const MUG_SLUG = 'gift-personalised-photo-mug'
  19  | const MUG_URL = `${STOREFRONT}/products/${MUG_SLUG}`
  20  | 
  21  | // ─────────────────────────────────────────────────────────────
  22  | // Helpers
  23  | // ─────────────────────────────────────────────────────────────
  24  | 
  25  | async function emptyCart(page: Page) {
  26  |   await page.goto(`${STOREFRONT}/cart`)
  27  |   const emptyBtn = page.getByRole('button', { name: /empty cart/i })
  28  |   if (await emptyBtn.isVisible()) {
  29  |     page.once('dialog', (d) => d.accept())
  30  |     await emptyBtn.click()
  31  |     await expect(page.getByText(/your cart is empty/i)).toBeVisible()
  32  |   }
  33  | }
  34  | 
  35  | async function adminLogin(page: Page) {
  36  |   await page.goto(`${ADMIN}/login`)
  37  |   await page.locator('#email').fill('superadmin@acme.com')
  38  |   await page.locator('#password').fill('secret')
  39  |   // The submit button starts disabled (SSR); wait for JS to enable it after fields are filled
  40  |   const signInBtn = page.getByRole('button', { name: /sign in/i })
  41  |   await expect(signInBtn).toBeEnabled({ timeout: 10_000 })
> 42  |   await signInBtn.click()
      |                   ^ Error: locator.click: Test timeout of 90000ms exceeded.
  43  |   // Admin redirects to /backend after successful login
  44  |   await expect(page).toHaveURL(/\/backend/, { timeout: 15_000 })
  45  | }
  46  | 
  47  | async function addMugToCart(
  48  |   page: Page,
  49  |   opts: { variant?: '11 oz' | '15 oz'; giftWrap?: boolean; giftMessage?: string } = {},
  50  | ) {
  51  |   await page.goto(MUG_URL)
  52  |   // Wait for the add-to-cart form (reliable SSR landmark)
  53  |   await page.getByRole('button', { name: /add to cart/i }).waitFor({ state: 'visible', timeout: 20_000 })
  54  | 
  55  |   if (opts.variant) {
  56  |     await page.getByRole('radio', { name: new RegExp(opts.variant, 'i') }).click()
  57  |   }
  58  |   if (opts.giftWrap) {
  59  |     await page.locator('#gift-wrap').check()
  60  |   }
  61  |   if (opts.giftMessage) {
  62  |     await page.locator('#gift-message').fill(opts.giftMessage)
  63  |   }
  64  |   await page.getByRole('button', { name: /add to cart/i }).click()
  65  |   await expect(page.getByText(/added to your cart/i)).toBeVisible()
  66  | }
  67  | 
  68  | // ─────────────────────────────────────────────────────────────
  69  | // Section 1 – Storefront: browsing (no login)
  70  | // ─────────────────────────────────────────────────────────────
  71  | 
  72  | test.describe('TC-SF-BROWSE-001 Home page loads', () => {
  73  |   test('hero, occasion tiles and featured products are visible', async ({ page }) => {
  74  |     await page.goto(STOREFRONT)
  75  |     // Hero section
  76  |     await expect(page.locator('main')).toBeVisible()
  77  |     // "Shop by occasion" tiles grid
  78  |     await expect(page.getByRole('link', { name: /occasion|birthday|wedding|anniversary/i }).first()).toBeVisible()
  79  |     // At least one product card
  80  |     await expect(page.getByRole('link', { name: /mug|gift|hamper|card/i }).first()).toBeVisible()
  81  |   })
  82  | })
  83  | 
  84  | test.describe('TC-SF-BROWSE-002 Products listing', () => {
  85  |   test('/products shows gift products with INR prices', async ({ page }) => {
  86  |     await page.goto(`${STOREFRONT}/products`)
  87  |     // Products page is SSR; wait for at least one article card to appear
  88  |     await page.locator('article').first().waitFor({ state: 'visible', timeout: 20_000 })
  89  |     // Each article card has a price span with ₹
  90  |     const priceSpan = page.locator('article').filter({ hasText: /₹/ }).first()
  91  |     await expect(priceSpan).toBeVisible()
  92  |     // At least one product present
  93  |     expect(await page.locator('article').count()).toBeGreaterThan(0)
  94  |   })
  95  | 
  96  |   test('search filter narrows results', async ({ page }) => {
  97  |     await page.goto(`${STOREFRONT}/products`)
  98  |     await page.locator('article').first().waitFor({ state: 'visible', timeout: 20_000 })
  99  |     // The search input has type="search" and placeholder "Search gifts…"
  100 |     const searchInput = page.locator('input[type="search"]').first()
  101 |     await searchInput.fill('mug')
  102 |     await searchInput.press('Enter')
  103 |     // Results heading or an article should contain "mug"
  104 |     await expect(
  105 |       page.getByRole('heading', { name: /mug/i }).or(page.locator('article').filter({ hasText: /mug/i })).first()
  106 |     ).toBeVisible({ timeout: 15_000 })
  107 |   })
  108 | 
  109 |   test('price-range filter requires both min and max', async ({ page }) => {
  110 |     await page.goto(`${STOREFRONT}/products`)
  111 |     await page.waitForLoadState('networkidle')
  112 |     const minInput = page.getByRole('spinbutton', { name: /min/i })
  113 |     if (await minInput.isVisible()) {
  114 |       await minInput.fill('100')
  115 |       // Submitting only min should not error silently – page should still render
  116 |       await expect(page.locator('main')).toBeVisible()
  117 |     }
  118 |   })
  119 | })
  120 | 
  121 | test.describe('TC-SF-BROWSE-003 Personalised Photo Mug page', () => {
  122 |   test('switching 11 oz / 15 oz changes the displayed price', async ({ page }) => {
  123 |     await page.goto(MUG_URL)
  124 |     await page.getByRole('button', { name: /add to cart/i }).waitFor({ state: 'visible', timeout: 20_000 })
  125 | 
  126 |     const oz11 = page.getByRole('radio', { name: /11\s*oz/i })
  127 |     const oz15 = page.getByRole('radio', { name: /15\s*oz/i })
  128 | 
  129 |     await oz11.click()
  130 |     // Price is the first tabular-nums span inside the form's price paragraph
  131 |     const priceSpan = page.locator('form span.tabular-nums').first()
  132 |     const price11 = await priceSpan.innerText()
  133 | 
  134 |     await oz15.click()
  135 |     await expect(priceSpan).not.toHaveText(price11, { timeout: 5_000 })
  136 |     const price15 = await priceSpan.innerText()
  137 | 
  138 |     expect(price11).not.toBe(price15)
  139 |     expect(price11).toContain('399')
  140 |     expect(price15).toContain('499')
  141 |   })
  142 | 
```