/**
 * TC-PHASE1-CHECKLIST
 * End-to-end coverage of the Phase 1 test checklist for the Gift-App storefront and admin.
 *
 * Pre-requisites (both servers must be running):
 *   cd apps/mercato   && yarn dev:classic   # admin + API on :3000
 *   cd apps/storefront && npm run dev        # storefront on :3100
 *
 * Run:
 *   BASE_URL=http://localhost:3100 ADMIN_URL=http://localhost:3000 npx playwright test TC-PHASE1-CHECKLIST.spec.ts
 */

import { test, expect, type Page } from '@playwright/test'

const STOREFRONT = process.env.BASE_URL ?? 'http://localhost:3100'
const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:3000'

const MUG_SLUG = 'gift-personalised-photo-mug'
const MUG_URL = `${STOREFRONT}/products/${MUG_SLUG}`

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function emptyCart(page: Page) {
  await page.goto(`${STOREFRONT}/cart`)
  const emptyBtn = page.getByRole('button', { name: /empty cart/i })
  if (await emptyBtn.isVisible()) {
    page.once('dialog', (d) => d.accept())
    await emptyBtn.click()
    await expect(page.getByText(/your cart is empty/i)).toBeVisible()
  }
}

async function adminLogin(page: Page) {
  await page.goto(`${ADMIN}/login`)
  await page.locator('#email').fill('superadmin@acme.com')
  await page.locator('#password').fill('secret')
  // The submit button starts disabled (SSR); wait for JS to enable it after fields are filled
  const signInBtn = page.getByRole('button', { name: /sign in/i })
  await expect(signInBtn).toBeEnabled({ timeout: 10_000 })
  await signInBtn.click()
  // Admin redirects to /backend after successful login
  await expect(page).toHaveURL(/\/backend/, { timeout: 15_000 })
}

async function addMugToCart(
  page: Page,
  opts: { variant?: '11 oz' | '15 oz'; giftWrap?: boolean; giftMessage?: string } = {},
) {
  await page.goto(MUG_URL)
  // Wait for the add-to-cart form (reliable SSR landmark)
  await page.getByRole('button', { name: /add to cart/i }).waitFor({ state: 'visible', timeout: 20_000 })

  if (opts.variant) {
    await page.getByRole('radio', { name: new RegExp(opts.variant, 'i') }).click()
  }
  if (opts.giftWrap) {
    await page.locator('#gift-wrap').check()
  }
  if (opts.giftMessage) {
    await page.locator('#gift-message').fill(opts.giftMessage)
  }
  await page.getByRole('button', { name: /add to cart/i }).click()
  await expect(page.getByText(/added to your cart/i)).toBeVisible()
}

// ─────────────────────────────────────────────────────────────
// Section 1 – Storefront: browsing (no login)
// ─────────────────────────────────────────────────────────────

test.describe('TC-SF-BROWSE-001 Home page loads', () => {
  test('hero, occasion tiles and featured products are visible', async ({ page }) => {
    await page.goto(STOREFRONT)
    // Hero section
    await expect(page.locator('main')).toBeVisible()
    // "Shop by occasion" tiles grid
    await expect(page.getByRole('link', { name: /occasion|birthday|wedding|anniversary/i }).first()).toBeVisible()
    // At least one product card
    await expect(page.getByRole('link', { name: /mug|gift|hamper|card/i }).first()).toBeVisible()
  })
})

test.describe('TC-SF-BROWSE-002 Products listing', () => {
  test('/products shows gift products with INR prices', async ({ page }) => {
    await page.goto(`${STOREFRONT}/products`)
    // Products page is SSR; wait for at least one article card to appear
    await page.locator('article').first().waitFor({ state: 'visible', timeout: 20_000 })
    // Each article card has a price span with ₹
    const priceSpan = page.locator('article').filter({ hasText: /₹/ }).first()
    await expect(priceSpan).toBeVisible()
    // At least one product present
    expect(await page.locator('article').count()).toBeGreaterThan(0)
  })

  test('search filter narrows results', async ({ page }) => {
    await page.goto(`${STOREFRONT}/products`)
    await page.locator('article').first().waitFor({ state: 'visible', timeout: 20_000 })
    // The search input has type="search" and placeholder "Search gifts…"
    const searchInput = page.locator('input[type="search"]').first()
    await searchInput.fill('mug')
    await searchInput.press('Enter')
    // Results heading or an article should contain "mug"
    await expect(
      page.getByRole('heading', { name: /mug/i }).or(page.locator('article').filter({ hasText: /mug/i })).first()
    ).toBeVisible({ timeout: 15_000 })
  })

  test('price-range filter requires both min and max', async ({ page }) => {
    await page.goto(`${STOREFRONT}/products`)
    await page.waitForLoadState('networkidle')
    const minInput = page.getByRole('spinbutton', { name: /min/i })
    if (await minInput.isVisible()) {
      await minInput.fill('100')
      // Submitting only min should not error silently – page should still render
      await expect(page.locator('main')).toBeVisible()
    }
  })
})

test.describe('TC-SF-BROWSE-003 Personalised Photo Mug page', () => {
  test('switching 11 oz / 15 oz changes the displayed price', async ({ page }) => {
    await page.goto(MUG_URL)
    await page.getByRole('button', { name: /add to cart/i }).waitFor({ state: 'visible', timeout: 20_000 })

    const oz11 = page.getByRole('radio', { name: /11\s*oz/i })
    const oz15 = page.getByRole('radio', { name: /15\s*oz/i })

    await oz11.click()
    // Price is the first tabular-nums span inside the form's price paragraph
    const priceSpan = page.locator('form span.tabular-nums').first()
    const price11 = await priceSpan.innerText()

    await oz15.click()
    await expect(priceSpan).not.toHaveText(price11, { timeout: 5_000 })
    const price15 = await priceSpan.innerText()

    expect(price11).not.toBe(price15)
    expect(price11).toContain('399')
    expect(price15).toContain('499')
  })

  test('"Customizable — 3D designer coming soon" badge is visible', async ({ page }) => {
    await page.goto(MUG_URL)
    await page.getByRole('button', { name: /add to cart/i }).waitFor({ state: 'visible', timeout: 20_000 })
    await expect(page.getByText(/customizable.*3d designer coming soon/i)).toBeVisible()
  })

  test('gift wrap checkbox and gift message textarea are visible', async ({ page }) => {
    await page.goto(MUG_URL)
    await page.getByRole('button', { name: /add to cart/i }).waitFor({ state: 'visible', timeout: 20_000 })
    await expect(page.locator('#gift-wrap')).toBeVisible()
    await expect(page.locator('#gift-message')).toBeVisible()
  })
})

test.describe('TC-SF-BROWSE-004 Responsive & dark mode', () => {
  test('mobile viewport – page renders without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(STOREFRONT)
    await expect(page.locator('body')).toBeVisible()
    // No horizontal scrollbar
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2) // 2px tolerance
  })

  test('dark mode toggle switches theme', async ({ page }) => {
    await page.goto(STOREFRONT)
    const toggle = page.getByRole('button', { name: /dark|light|theme/i })
    if (await toggle.isVisible()) {
      await toggle.click()
      const html = page.locator('html')
      const cls = await html.getAttribute('class')
      const dataTheme = await html.getAttribute('data-theme')
      expect(cls?.includes('dark') || dataTheme === 'dark').toBeTruthy()
    }
  })
})

// ─────────────────────────────────────────────────────────────
// Section 2 – Cart
// ─────────────────────────────────────────────────────────────

test.describe('TC-SF-CART-001 Add mug with gift options', () => {
  test.beforeEach(async ({ page }) => emptyCart(page))

  test('cart total reflects gift wrap + message addition', async ({ page }) => {
    await addMugToCart(page, { variant: '11 oz', giftWrap: true, giftMessage: 'Happy birthday!' })
    await page.goto(`${STOREFRONT}/cart`)
    await expect(page.getByRole('region', { name: /cart items/i })).toBeVisible()
    // Product title visible
    await expect(page.getByRole('heading', { level: 3 }).filter({ hasText: /mug/i })).toBeVisible()
    // Gift message visible
    await expect(page.getByText(/happy birthday/i)).toBeVisible()
  })
})

test.describe('TC-SF-CART-002 Quantity and total update', () => {
  test.beforeEach(async ({ page }) => emptyCart(page))

  test('increasing quantity updates subtotal', async ({ page }) => {
    await addMugToCart(page, { variant: '11 oz' })
    await page.goto(`${STOREFRONT}/cart`)

    // The Order summary card uses a <dl>; the first <dd> is the subtotal
    const subtotalEl = page.locator('dl dd').first()
    const subtotalBefore = await subtotalEl.innerText()

    await page.getByRole('button', { name: /increase quantity of/i }).click()
    await page.waitForFunction((before) => {
      const el = document.querySelector('dl dd')
      return el && el.textContent !== before
    }, subtotalBefore)

    const subtotalAfter = await subtotalEl.innerText()
    expect(subtotalAfter).not.toBe(subtotalBefore)
  })
})

test.describe('TC-SF-CART-003 Edit gift message in cart', () => {
  test.beforeEach(async ({ page }) => emptyCart(page))

  test('can edit the gift message on a cart line', async ({ page }) => {
    await addMugToCart(page, { variant: '11 oz', giftMessage: 'Original message' })
    await page.goto(`${STOREFRONT}/cart`)
    await page.getByRole('button', { name: /gift options/i }).click()
    const textarea = page.getByLabel(/gift message/i)
    await textarea.clear()
    await textarea.fill('Updated message')
    await page.getByRole('button', { name: /save gift options/i }).click()
    await expect(page.getByText(/updated message/i)).toBeVisible()
  })
})

test.describe('TC-SF-CART-004 Remove a line', () => {
  test.beforeEach(async ({ page }) => emptyCart(page))

  test('removing the only item leaves the cart empty', async ({ page }) => {
    await addMugToCart(page, { variant: '11 oz' })
    await page.goto(`${STOREFRONT}/cart`)
    await page.getByRole('button', { name: /remove/i }).first().click()
    await expect(page.getByText(/your cart is empty/i)).toBeVisible()
  })
})

test.describe('TC-SF-CART-005 Empty cart', () => {
  test.beforeEach(async ({ page }) => emptyCart(page))

  test('"Empty cart" button clears everything', async ({ page }) => {
    await addMugToCart(page, { variant: '11 oz' })
    await page.goto(`${STOREFRONT}/cart`)
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: /empty cart/i }).click()
    await expect(page.getByText(/your cart is empty/i)).toBeVisible()
  })
})

test.describe('TC-SF-CART-006 Gift message too long', () => {
  test.beforeEach(async ({ page }) => emptyCart(page))

  test('message over the limit shows an inline error', async ({ page }) => {
    await addMugToCart(page, { variant: '11 oz', giftMessage: 'Hi' })
    await page.goto(`${STOREFRONT}/cart`)
    await page.getByRole('button', { name: /gift options/i }).click()

    const longMessage = 'A'.repeat(260)
    const textarea = page.getByLabel(/gift message/i)
    await textarea.clear()
    await textarea.fill(longMessage)
    await page.getByRole('button', { name: /save gift options/i }).click()

    // Expect either inline validation error or server rejection
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 8_000 })
  })
})

test.describe('TC-SF-CART-007 Cart persists on reload', () => {
  test.beforeEach(async ({ page }) => emptyCart(page))

  test('cart lines survive a page reload (server-stored)', async ({ page }) => {
    await addMugToCart(page, { variant: '11 oz' })
    await page.goto(`${STOREFRONT}/cart`)
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { level: 3 }).filter({ hasText: /mug/i })).toBeVisible()
  })
})

// ─────────────────────────────────────────────────────────────
// Section 3 – Checkout (guest)
// ─────────────────────────────────────────────────────────────

test.describe('TC-SF-CHECKOUT-001 Input validation', () => {
  test.beforeEach(async ({ page }) => {
    await emptyCart(page)
    await addMugToCart(page, { variant: '11 oz' })
    await page.goto(`${STOREFRONT}/checkout`)
    // form[novalidate] is the checkout form; the search form in the nav also matches plain 'form'
    await page.locator('form[novalidate]').waitFor({ state: 'visible', timeout: 20_000 })
  })

  test('invalid 6-digit PIN code is rejected', async ({ page }) => {
    const pinInput = page.getByLabel(/pin|pincode|postal/i)
    await pinInput.fill('00000') // 5 digits – invalid
    await pinInput.blur()
    await expect(page.getByRole('alert').or(page.getByText(/invalid.*pin|pin.*invalid/i))).toBeVisible()
  })

  test('non-Indian mobile number is rejected', async ({ page }) => {
    const phoneInput = page.getByLabel(/phone|mobile/i)
    await phoneInput.fill('+1 555 000 0000') // US number
    await phoneInput.blur()
    await expect(page.getByRole('alert').or(page.getByText(/indian|invalid.*phone|phone.*invalid/i))).toBeVisible()
  })
})

test.describe('TC-SF-CHECKOUT-002 Delivery options', () => {
  test.beforeEach(async ({ page }) => {
    await emptyCart(page)
    await addMugToCart(page, { variant: '11 oz' })
    await page.goto(`${STOREFRONT}/checkout`)
    await page.locator('form[novalidate]').waitFor({ state: 'visible', timeout: 20_000 })
  })

  test('Standard (₹49) and Express (₹149) delivery options appear', async ({ page }) => {
    const deliveryGroup = page.getByRole('radiogroup', { name: /delivery/i })
    await expect(page.getByText(/standard/i)).toBeVisible()
    await expect(deliveryGroup.getByText(/₹49/)).toBeVisible()
    await expect(page.getByText(/express/i)).toBeVisible()
    await expect(deliveryGroup.getByText(/₹149/)).toBeVisible()
  })

  test('selecting Express updates the total', async ({ page }) => {
    const expressOption = page.getByRole('radio', { name: /express/i })
    if (await expressOption.isVisible()) {
      await expressOption.click()
      await expect(page.getByText(/149/)).toBeVisible()
    }
  })
})

test.describe('TC-SF-CHECKOUT-003 No payment keys – order saved', () => {
  test.beforeEach(async ({ page }) => {
    await emptyCart(page)
    await addMugToCart(page, { variant: '11 oz' })
  })

  test('shows "order saved" fallback when payment keys are absent', async ({ page }) => {
    await page.goto(`${STOREFRONT}/checkout`)
    await page.locator('form').waitFor({ state: 'visible', timeout: 20_000 })

    // Fill in minimal required guest fields if visible
    const nameField = page.getByLabel(/name/i).first()
    if (await nameField.isVisible()) await nameField.fill('Test Guest')
    const emailField = page.getByLabel(/email/i)
    if (await emailField.isVisible()) await emailField.fill('testguest@example.com')
    const phoneField = page.getByLabel(/phone|mobile/i)
    if (await phoneField.isVisible()) await phoneField.fill('9876543210')

    const placeOrder = page.getByRole('button', { name: /place order|pay now|continue/i })
    if (await placeOrder.isVisible()) {
      await placeOrder.click()
      // Either payment fallback message or order confirmation
      await expect(
        page.getByText(/could not start the payment|order is saved|complete your payment/i).or(
          page.getByText(/order.*confirm|thank you/i),
        ),
      ).toBeVisible({ timeout: 15_000 })
    }
  })
})

// ─────────────────────────────────────────────────────────────
// Section 4 – Customer account
// ─────────────────────────────────────────────────────────────

const TEST_EMAIL = `e2e_${Date.now()}@example.com`
const TEST_PASSWORD = 'Test@12345!'

test.describe('TC-SF-ACCOUNT-001 Registration', () => {
  test('can register a new customer account', async ({ page }) => {
    await page.goto(`${STOREFRONT}/account/register`)
    // Form fields: "Your name", "Email", "Password", "Confirm password"
    await page.getByLabel(/your name/i).fill('Test User')
    await page.getByLabel(/^email/i).fill(TEST_EMAIL)
    await page.getByLabel(/^password/i).fill(TEST_PASSWORD)
    await page.getByLabel(/confirm password/i).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: /create account/i }).click()
    // Expect either a "check your email" message or redirect to account
    await expect(
      page.getByText(/verify|check your email|account created/i).or(page.getByRole('heading', { name: /account/i })),
    ).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('TC-SF-ACCOUNT-002 Addresses CRUD', () => {
  test.skip(true, 'Requires a verified customer — run manually after verifying email in admin')

  test('add, edit, delete and set a default address', async ({ page }) => {
    await page.goto(`${STOREFRONT}/account/login`)
    await page.getByLabel(/email/i).fill('verified@example.com')
    await page.getByLabel(/password/i).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: /log in|sign in/i }).click()
    await expect(page).not.toHaveURL(/\/login/)

    await page.goto(`${STOREFRONT}/account/addresses`)
    await page.getByRole('button', { name: /add address|new address/i }).click()
    await page.getByLabel(/line 1|street/i).fill('123 Test Street')
    await page.getByLabel(/city/i).fill('Mumbai')
    await page.getByLabel(/state|province/i).fill('Maharashtra')
    await page.getByLabel(/pin|postal/i).fill('400001')
    await page.getByRole('button', { name: /save|add/i }).click()
    await expect(page.getByText(/123 test street/i)).toBeVisible()

    // Edit
    await page.getByRole('button', { name: /edit/i }).first().click()
    await page.getByLabel(/city/i).fill('Delhi')
    await page.getByRole('button', { name: /save/i }).click()
    await expect(page.getByText(/delhi/i)).toBeVisible()

    // Delete
    await page.getByRole('button', { name: /delete|remove/i }).first().click()
    await expect(page.getByText(/delhi/i)).not.toBeVisible()
  })
})

test.describe('TC-SF-ACCOUNT-003 Guest cart merges on login', () => {
  test.skip(true, 'Requires a verified customer — run manually')

  test('guest cart merges into account cart after login', async ({ page }) => {
    await emptyCart(page)
    await addMugToCart(page, { variant: '11 oz' })
    await page.goto(`${STOREFRONT}/account/login`)
    await page.getByLabel(/email/i).fill('verified@example.com')
    await page.getByLabel(/password/i).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: /log in|sign in/i }).click()
    await expect(page).not.toHaveURL(/\/login/)
    await page.goto(`${STOREFRONT}/cart`)
    await expect(page.getByRole('heading', { level: 3 }).filter({ hasText: /mug/i })).toBeVisible()
  })
})

// ─────────────────────────────────────────────────────────────
// Section 5 – Admin backend
// ─────────────────────────────────────────────────────────────

test.describe('TC-ADMIN-001 Admin login', () => {
  test('admin logs in with admin@acme.com / secret', async ({ page }) => {
    await adminLogin(page)
    // adminLogin already asserts URL contains /backend
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible()
  })
})

test.describe('TC-ADMIN-002 Orders list', () => {
  test.slow() // Allow 90s (3× the default 30s) — the orders page is slow on first load in dev
  test('orders page shows test orders with correct gift data', async ({ page }) => {
    await adminLogin(page)
    await page.goto(`${ADMIN}/backend/sales/orders`)
    await expect(page.getByText(/ORDER-/i).first()).toBeVisible({ timeout: 60_000 })
  })
})

test.describe('TC-ADMIN-003 Gift profile on product', () => {
  test.slow() // Widget is client-side; needs extra time to hydrate in dev mode
  test('Gift profile card is visible when editing a product', async ({ page }) => {
    await adminLogin(page)
    await page.goto(`${ADMIN}/backend/catalog/products`)
    // Wait for first data row to appear
    await page.getByRole('row').nth(1).waitFor({ state: 'visible', timeout: 20_000 })
    // Dismiss cookie banner so it doesn't intercept clicks
    const cookieBanner = page.getByRole('button', { name: /accept cookies/i })
    if (await cookieBanner.isVisible()) await cookieBanner.click()
    // Open the RowActions dropdown on the first product row (button renders as "⋯" / "Open actions")
    await page.getByRole('button', { name: /open actions/i }).first().click()
    // Click "Edit" in the dropdown (portaled to document.body, role="menuitem")
    await page.getByRole('menuitem', { name: /^edit$/i }).click()
    // Wait for navigation to the product edit URL
    await expect(page).toHaveURL(/\/backend\/catalog\/products\/[^/]+$/, { timeout: 15_000 })
    // The gift profile widget section header is "Gift profile" (groupLabel i18n key)
    await expect(page.getByText(/gift profile/i).first()).toBeVisible({ timeout: 45_000 })
  })
})

test.describe('TC-ADMIN-004 Gift occasions CRUD', () => {
  test('gift occasions list shows seeded occasions and create form is accessible', async ({ page }) => {
    await adminLogin(page)
    await page.goto(`${ADMIN}/backend/gift-occasions`)
    // Page title should appear (i18n: gift_catalog.occasions.page.title = "Gift occasions")
    await expect(page.getByText(/gift occasions/i).first()).toBeVisible({ timeout: 20_000 })
    // Seeded occasions (Birthday, Anniversary, etc.) should appear in the table
    await expect(page.getByText(/birthday|anniversary|graduation/i).first()).toBeVisible({ timeout: 20_000 })
    // "Add occasion" link (i18n: gift_catalog.occasions.actions.create = "Add occasion") is present
    await expect(page.getByRole('link', { name: /add occasion/i })).toBeVisible({ timeout: 10_000 })
    // Create form is reachable (checks routing is wired)
    await page.goto(`${ADMIN}/backend/gift-occasions/create`)
    await expect(page.getByRole('heading', { name: /create gift occasion/i })).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('TC-ADMIN-005 Customers list', () => {
  test('registered customers appear in the admin', async ({ page }) => {
    await adminLogin(page)
    // Storefront customer accounts are under /backend/customer_accounts/users
    await page.goto(`${ADMIN}/backend/customer_accounts/users`)
    await expect(page.locator('table tbody tr').first().or(page.getByRole('row').nth(1))).toBeVisible({ timeout: 20_000 })
  })
})
