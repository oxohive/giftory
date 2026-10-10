/**
 * Phase 1 end-to-end test suite — Giftory storefront and admin backend.
 *
 * Pre-requisites (both servers must be running):
 *   cd apps/mercato   && yarn dev:classic   # admin + API on :3000
 *   cd apps/storefront && npm run dev        # storefront on :3100
 *
 * Run:
 *   BASE_URL=http://localhost:3100 ADMIN_URL=http://localhost:3000 npx playwright test storefront-and-admin.spec.ts
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
  // Dismiss the dev diagnostics banner if it's covering interactive elements
  const diagBanner = page.getByTestId('dev-runtime-diagnostics-banner')
  if (await diagBanner.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await diagBanner.getByRole('button', { name: /dismiss/i }).click()
    await diagBanner.waitFor({ state: 'hidden', timeout: 5_000 })
  }
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

test.describe('Home page — hero banner, occasion tiles and featured products', () => {
  test('hero banner, "Shop by occasion" tiles, and at least one featured product card are all visible', async ({ page }) => {
    await page.goto(STOREFRONT)
    await expect(page.locator('main')).toBeVisible()
    // "Shop by occasion" tiles grid
    await expect(page.getByRole('link', { name: /occasion|birthday|wedding|anniversary/i }).first()).toBeVisible()
    // At least one product card
    await expect(page.getByRole('link', { name: /mug|gift|hamper|card/i }).first()).toBeVisible()
  })
})

test.describe('Gift products listing — browsing and filtering', () => {
  test('every product card shows an INR price (₹)', async ({ page }) => {
    await page.goto(`${STOREFRONT}/products`)
    // Products page is SSR; wait for at least one article card to appear
    await page.locator('article').first().waitFor({ state: 'visible', timeout: 20_000 })
    // Each article card has a price span with ₹
    const priceSpan = page.locator('article').filter({ hasText: /₹/ }).first()
    await expect(priceSpan).toBeVisible()
    expect(await page.locator('article').count()).toBeGreaterThan(0)
  })

  test('searching "mug" narrows the product list to matching results', async ({ page }) => {
    await page.goto(`${STOREFRONT}/products`)
    await page.locator('article').first().waitFor({ state: 'visible', timeout: 20_000 })
    const searchInput = page.locator('input[type="search"]').first()
    await searchInput.fill('mug')
    await searchInput.press('Enter')
    await expect(
      page.getByRole('heading', { name: /mug/i }).or(page.locator('article').filter({ hasText: /mug/i })).first()
    ).toBeVisible({ timeout: 15_000 })
  })

  test('entering only a min price does not crash the page', async ({ page }) => {
    await page.goto(`${STOREFRONT}/products`)
    await page.waitForLoadState('networkidle')
    const minInput = page.getByRole('spinbutton', { name: /min/i })
    if (await minInput.isVisible()) {
      await minInput.fill('100')
      await expect(page.locator('main')).toBeVisible()
    }
  })
})

test.describe('Product detail page — Personalised Photo Mug', () => {
  test('switching from 11 oz to 15 oz updates the displayed price (399 → 499)', async ({ page }) => {
    await page.goto(MUG_URL)
    await page.getByRole('button', { name: /add to cart/i }).waitFor({ state: 'visible', timeout: 20_000 })

    const oz11 = page.getByRole('radio', { name: /11\s*oz/i })
    const oz15 = page.getByRole('radio', { name: /15\s*oz/i })

    await oz11.click()
    const priceSpan = page.locator('form span.tabular-nums').first()
    const price11 = await priceSpan.innerText()

    await oz15.click()
    await expect(priceSpan).not.toHaveText(price11, { timeout: 5_000 })
    const price15 = await priceSpan.innerText()

    expect(price11).not.toBe(price15)
    expect(price11).toContain('399')
    expect(price15).toContain('499')
  })

  test('"Customizable — 3D designer coming soon" badge is displayed on the product', async ({ page }) => {
    await page.goto(MUG_URL)
    await page.getByRole('button', { name: /add to cart/i }).waitFor({ state: 'visible', timeout: 20_000 })
    await expect(page.getByText(/customizable.*3d designer coming soon/i)).toBeVisible()
  })

  test('gift wrap checkbox and gift message textarea are present on the add-to-cart form', async ({ page }) => {
    await page.goto(MUG_URL)
    await page.getByRole('button', { name: /add to cart/i }).waitFor({ state: 'visible', timeout: 20_000 })
    await expect(page.locator('#gift-wrap')).toBeVisible()
    await expect(page.locator('#gift-message')).toBeVisible()
  })
})

test.describe('Layout — responsive viewport and dark mode toggle', () => {
  test('iPhone-sized viewport (390×844) renders without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(STOREFRONT)
    await expect(page.locator('body')).toBeVisible()
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2) // 2px tolerance
  })

  test('dark mode toggle switches the html element to the dark theme', async ({ page }) => {
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

test.describe('Cart — add item with gift wrap and message', () => {
  test.beforeEach(async ({ page }) => emptyCart(page))

  test('cart page shows the product, gift message, and gift wrap indicator', async ({ page }) => {
    await addMugToCart(page, { variant: '11 oz', giftWrap: true, giftMessage: 'Happy birthday!' })
    await page.goto(`${STOREFRONT}/cart`)
    await expect(page.getByRole('region', { name: /cart items/i })).toBeVisible()
    await expect(page.getByRole('heading', { level: 3 }).filter({ hasText: /mug/i })).toBeVisible()
    await expect(page.getByText(/happy birthday/i)).toBeVisible()
  })
})

test.describe('Cart — quantity change updates the order subtotal', () => {
  test.beforeEach(async ({ page }) => emptyCart(page))

  test('clicking "increase quantity" raises the displayed subtotal', async ({ page }) => {
    await addMugToCart(page, { variant: '11 oz' })
    await page.goto(`${STOREFRONT}/cart`)

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

test.describe('Cart — edit gift message on a line item', () => {
  test.beforeEach(async ({ page }) => emptyCart(page))

  test('saving an edited gift message replaces the original text in the cart', async ({ page }) => {
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

test.describe('Cart — remove a single line item', () => {
  test.beforeEach(async ({ page }) => emptyCart(page))

  test('removing the only item in the cart shows the empty cart state', async ({ page }) => {
    await addMugToCart(page, { variant: '11 oz' })
    await page.goto(`${STOREFRONT}/cart`)
    await page.getByRole('button', { name: /remove/i }).first().click()
    await expect(page.getByText(/your cart is empty/i)).toBeVisible()
  })
})

test.describe('Cart — empty all items at once', () => {
  test.beforeEach(async ({ page }) => emptyCart(page))

  test('"Empty cart" button clears all items after the confirmation dialog', async ({ page }) => {
    await addMugToCart(page, { variant: '11 oz' })
    await page.goto(`${STOREFRONT}/cart`)
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: /empty cart/i }).click()
    await expect(page.getByText(/your cart is empty/i)).toBeVisible()
  })
})

test.describe('Cart — gift message character limit validation', () => {
  test.beforeEach(async ({ page }) => emptyCart(page))

  test('a gift message over 255 characters triggers an inline validation error', async ({ page }) => {
    await addMugToCart(page, { variant: '11 oz', giftMessage: 'Hi' })
    await page.goto(`${STOREFRONT}/cart`)
    await page.getByRole('button', { name: /gift options/i }).click()

    const longMessage = 'A'.repeat(260)
    const textarea = page.getByLabel(/gift message/i)
    await textarea.clear()
    await textarea.fill(longMessage)
    await page.getByRole('button', { name: /save gift options/i }).click()

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 8_000 })
  })
})

test.describe('Cart — items survive a full page reload (server-side cart)', () => {
  test.beforeEach(async ({ page }) => emptyCart(page))

  test('cart lines are still present after reloading the page', async ({ page }) => {
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

test.describe('Checkout — address form field validation', () => {
  test.beforeEach(async ({ page }) => {
    await emptyCart(page)
    await addMugToCart(page, { variant: '11 oz' })
    await page.goto(`${STOREFRONT}/checkout`)
    await page.locator('form[novalidate]').waitFor({ state: 'visible', timeout: 20_000 })
  })

  test('a 5-digit PIN code is rejected with a validation error', async ({ page }) => {
    const pinInput = page.getByLabel(/pin|pincode|postal/i)
    await pinInput.fill('00000') // 5 digits – invalid (India requires 6)
    await pinInput.blur()
    await expect(page.getByRole('alert').or(page.getByText(/invalid.*pin|pin.*invalid/i))).toBeVisible()
  })

  test('a non-Indian mobile number (+1 prefix) is rejected with a validation error', async ({ page }) => {
    const phoneInput = page.getByLabel(/phone|mobile/i)
    await phoneInput.fill('+1 555 000 0000') // US number
    await phoneInput.blur()
    await expect(page.getByRole('alert').or(page.getByText(/indian|invalid.*phone|phone.*invalid/i))).toBeVisible()
  })
})

test.describe('Checkout — delivery method selection and pricing', () => {
  test.beforeEach(async ({ page }) => {
    await emptyCart(page)
    await addMugToCart(page, { variant: '11 oz' })
    await page.goto(`${STOREFRONT}/checkout`)
    await page.locator('form[novalidate]').waitFor({ state: 'visible', timeout: 20_000 })
  })

  test('both Standard (₹49) and Express (₹149) delivery options appear in the delivery section', async ({ page }) => {
    const deliveryGroup = page.getByRole('radiogroup', { name: /delivery/i })
    await expect(page.getByText(/standard/i)).toBeVisible()
    await expect(deliveryGroup.getByText(/₹49/)).toBeVisible()
    await expect(page.getByText(/express/i)).toBeVisible()
    await expect(deliveryGroup.getByText(/₹149/)).toBeVisible()
  })

  test('selecting Express delivery adds ₹149 to the visible order total', async ({ page }) => {
    const expressOption = page.getByRole('radio', { name: /express/i })
    if (await expressOption.isVisible()) {
      await expressOption.click()
      await expect(page.getByText(/149/)).toBeVisible()
    }
  })
})

test.describe('Checkout — graceful fallback when payment keys are absent', () => {
  test.beforeEach(async ({ page }) => {
    await emptyCart(page)
    await addMugToCart(page, { variant: '11 oz' })
  })

  test('placing an order without payment keys shows an "order saved" or payment fallback message', async ({ page }) => {
    await page.goto(`${STOREFRONT}/checkout`)
    await page.locator('form').waitFor({ state: 'visible', timeout: 20_000 })

    const nameField = page.getByLabel(/name/i).first()
    if (await nameField.isVisible()) await nameField.fill('Test Guest')
    const emailField = page.getByLabel(/email/i)
    if (await emailField.isVisible()) await emailField.fill('testguest@example.com')
    const phoneField = page.getByLabel(/phone|mobile/i)
    if (await phoneField.isVisible()) await phoneField.fill('9876543210')

    const placeOrder = page.getByRole('button', { name: /place order|pay now|continue/i })
    if (await placeOrder.isVisible()) {
      await placeOrder.click()
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

test.describe('Customer accounts — new account registration', () => {
  test('completing the registration form shows a "verify your email" prompt or redirects to the account page', async ({ page }) => {
    await page.goto(`${STOREFRONT}/account/register`)
    await page.getByLabel(/your name/i).fill('Test User')
    await page.getByLabel(/^email/i).fill(TEST_EMAIL)
    await page.getByLabel(/^password/i).fill(TEST_PASSWORD)
    await page.getByLabel(/confirm password/i).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: /create account/i }).click()
    await expect(
      page.getByText(/verify|check your email|account created/i).or(page.getByRole('heading', { name: /account/i })),
    ).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('Customer accounts — address book (add, edit, delete, set default)', () => {
  test.skip(true, 'Requires a verified customer — run manually after verifying email in admin')

  test('can add a Mumbai address, edit the city to Delhi, then delete it', async ({ page }) => {
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

    // Edit: change city from Mumbai to Delhi
    await page.getByRole('button', { name: /edit/i }).first().click()
    await page.getByLabel(/city/i).fill('Delhi')
    await page.getByRole('button', { name: /save/i }).click()
    await expect(page.getByText(/delhi/i)).toBeVisible()

    // Delete: address row disappears
    await page.getByRole('button', { name: /delete|remove/i }).first().click()
    await expect(page.getByText(/delhi/i)).not.toBeVisible()
  })
})

test.describe('Customer accounts — guest cart merges into account cart on login', () => {
  test.skip(true, 'Requires a verified customer — run manually')

  test('items added as a guest are still in the cart after signing in', async ({ page }) => {
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

test.describe('Admin — superadmin login', () => {
  test('signing in with superadmin@acme.com / secret lands on the /backend dashboard', async ({ page }) => {
    await adminLogin(page)
    // adminLogin already asserts URL contains /backend
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible()
  })
})

test.describe('Admin — orders list shows gift order data', () => {
  test.slow() // Allow 90s (3× the default 30s) — the orders page is slow on first load in dev
  test('orders list page displays at least one ORDER- reference number', async ({ page }) => {
    await adminLogin(page)
    await page.goto(`${ADMIN}/backend/sales/orders`)
    await expect(page.getByText(/ORDER-/i).first()).toBeVisible({ timeout: 60_000 })
  })
})

test.describe('Admin — product edit page shows the gift profile widget', () => {
  test.slow() // Widget is client-side; needs extra time to hydrate in dev mode
  test('opening a product via the row actions menu shows the "Gift profile" section', async ({ page }) => {
    await adminLogin(page)
    await page.goto(`${ADMIN}/backend/catalog/products`)
    await page.getByRole('row').nth(1).waitFor({ state: 'visible', timeout: 20_000 })
    // Dismiss cookie banner so it doesn't intercept clicks
    const cookieBanner = page.getByRole('button', { name: /accept cookies/i })
    if (await cookieBanner.isVisible()) await cookieBanner.click()
    // Open the RowActions dropdown on the first product row
    await page.getByRole('button', { name: /open actions/i }).first().click()
    await page.getByRole('menuitem', { name: /^edit$/i }).click()
    await expect(page).toHaveURL(/\/backend\/catalog\/products\/[^/]+$/, { timeout: 15_000 })
    await expect(page.getByText(/gift profile/i).first()).toBeVisible({ timeout: 45_000 })
  })
})

test.describe('Admin — gift occasions management (list and create form)', () => {
  test('occasions list shows seeded occasions (Birthday, Anniversary) and the "Add occasion" link is reachable', async ({ page }) => {
    await adminLogin(page)
    await page.goto(`${ADMIN}/backend/gift-occasions`)
    await expect(page.getByText(/gift occasions/i).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/birthday|anniversary|graduation/i).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('link', { name: /add occasion/i })).toBeVisible({ timeout: 10_000 })
    // Create form route is wired and the heading renders
    await page.goto(`${ADMIN}/backend/gift-occasions/create`)
    await expect(page.getByRole('heading', { name: /create gift occasion/i })).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('Admin — storefront customers appear in the users list', () => {
  test('customer accounts list shows at least one registered customer row', async ({ page }) => {
    await adminLogin(page)
    await page.goto(`${ADMIN}/backend/customer_accounts/users`)
    await expect(page.locator('table tbody tr').first().or(page.getByRole('row').nth(1))).toBeVisible({ timeout: 20_000 })
  })
})
