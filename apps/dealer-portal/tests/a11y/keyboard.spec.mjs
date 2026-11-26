/**
 * Scripted manual checks axe can't make on its own: keyboard operation, visible focus, focus
 * management after dialogs/errors/route-level replacements, status-message announcements,
 * 320px reflow, mobile navigation and reduced motion. Same mock API as pages.spec.mjs.
 */
import { expect, test } from '@playwright/test'
import { signIn, waitForSettled } from './helpers.mjs'

const ORG_ID = '00000000-0000-4000-8000-000000000002'

/** Describes the currently focused element, for readable assertion failures. */
function activeElementInfo(page) {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return { tag: 'body' }
    const style = getComputedStyle(el)
    // Composite controls (e.g. the product-type tag input) draw the ring on a :focus-within wrapper.
    const wrapper = el.parentElement ? getComputedStyle(el.parentElement) : null
    return {
      wrapperOutline: wrapper ? wrapper.outlineStyle !== 'none' && parseFloat(wrapper.outlineWidth) > 0 : false,
      tag: el.tagName.toLowerCase(),
      id: el.id,
      text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 60),
      outlineStyle: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth),
      boxShadow: style.boxShadow,
      inDialog: Boolean(el.closest('[role="dialog"]')),
    }
  })
}

test.describe('keyboard and focus', () => {
  test('skip link is the first tab stop and moves focus into <main> (2.4.1)', async ({ page, context }) => {
    await signIn(context, 'owner')
    await page.goto('/')
    await waitForSettled(page, 'Dashboard')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeInViewport()
    await page.keyboard.press('Enter')
    await expect(page.locator('main#main')).toBeFocused()
    // The next Tab continues inside main, not back in the sidebar.
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('main')))).toBe(true)
  })

  for (const { name, token, path, ready } of [
    { name: 'login', path: '/login', ready: 'Sign in' },
    { name: 'dashboard', token: 'owner', path: '/', ready: 'Dashboard' },
    { name: 'orders', token: 'owner', path: '/orders', ready: 'Orders' },
    { name: 'capabilities', token: 'owner', path: '/profile/capabilities', ready: 'Edit capabilities' },
    { name: 'register', path: `/onboarding/register?organizationId=${ORG_ID}`, ready: 'Become a dealer' },
  ]) {
    test(`every tab stop on ${name} shows a visible focus indicator (2.4.7)`, async ({ page, context }) => {
      if (token) await signIn(context, token)
      await page.goto(path)
      await waitForSettled(page, ready)
      const seen = new Set()
      for (let i = 0; i < 60; i += 1) {
        await page.keyboard.press('Tab')
        const info = await activeElementInfo(page)
        if (info.tag === 'body') break
        if (info.tag === 'nextjs-portal') continue // Next's dev-mode indicator; absent from production builds
        const key = `${info.tag}#${info.id}:${info.text}`
        if (seen.has(key)) break
        seen.add(key)
        const visible =
          (info.outlineStyle !== 'none' && info.outlineWidth > 0) || (info.boxShadow && info.boxShadow !== 'none') || info.wrapperOutline
        expect(visible, `no visible focus indicator on ${key}`).toBe(true)
      }
      expect(seen.size).toBeGreaterThan(2)
    })
  }

  test('login works keyboard-only and announces a failed sign-in (2.1.1, 4.1.3)', async ({ page }) => {
    await page.goto('/login')
    await waitForSettled(page, 'Sign in')
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Email')).toBeFocused()
    await page.keyboard.type('wrong@example.com')
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Password')).toBeFocused()
    await page.keyboard.type('nope')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password' })).toBeVisible()
  })

  test('register: failed validation focuses the first invalid field, described by its error (3.3.1)', async ({ page }) => {
    await page.goto(`/onboarding/register?organizationId=${ORG_ID}`)
    await waitForSettled(page, 'Become a dealer')
    await page.getByRole('button', { name: 'Submit application' }).click()
    const first = page.getByLabel('Business name')
    await expect(first).toBeFocused()
    await expect(first).toHaveAttribute('aria-invalid', 'true')
    await expect(first).toHaveAccessibleDescription(/Business name/i)
  })

  test('capabilities: failed validation focuses the first invalid field (3.3.1)', async ({ page, context }) => {
    await signIn(context, 'owner')
    await page.goto('/profile/capabilities')
    await waitForSettled(page, 'Edit capabilities')
    await page.getByLabel('Max daily capacity').fill('')
    await page.getByRole('button', { name: 'Save capabilities' }).click()
    const field = page.getByLabel('Max daily capacity')
    await expect(field).toBeFocused()
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await expect(field).toHaveAccessibleDescription(/.+/)
  })

  test('capabilities: product-type tag input is labelled and keeps focus after removing a tag (1.3.1, 2.4.3)', async ({ page, context }) => {
    await signIn(context, 'owner')
    await page.goto('/profile/capabilities')
    await waitForSettled(page, 'Edit capabilities')
    const input = page.getByLabel('Product types')
    await expect(input).toBeVisible()
    await page.getByRole('button', { name: 'Remove mugs' }).click()
    await expect(input).toBeFocused()
    await expect(page.getByRole('group', { name: 'Printing methods' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Serviceable states' })).toBeVisible()
  })

  test('forgot password: confirmation heading receives focus (2.4.3, 4.1.3)', async ({ page }) => {
    await page.goto('/forgot-password')
    await waitForSettled(page, 'Forgot your password?')
    await page.getByLabel('Email').fill('owner@kalpana.example')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeFocused()
  })

  test('invite dialog: focus moves in, is trapped, Escape closes and focus returns (2.1.2, 2.4.3)', async ({ page, context }) => {
    await signIn(context, 'owner')
    await page.goto('/staff')
    await waitForSettled(page, 'Staff')
    const trigger = page.getByRole('button', { name: 'Invite staff' })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Invite staff' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Email')).toBeFocused()
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab')
      expect((await activeElementInfo(page)).inDialog, 'focus escaped the dialog').toBe(true)
    }
    // Validation errors inside the dialog: first invalid field is focused.
    await dialog.getByRole('button', { name: 'Send invite' }).click()
    await expect(dialog.getByLabel('Email')).toBeFocused()
    await expect(dialog.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('invite success is announced via a status region (4.1.3)', async ({ page, context }) => {
    await signIn(context, 'owner')
    await page.goto('/staff')
    await waitForSettled(page, 'Staff')
    await page.getByRole('button', { name: 'Invite staff' }).click()
    const dialog = page.getByRole('dialog', { name: 'Invite staff' })
    await dialog.getByLabel('Email').fill('new.person@kalpana.example')
    await dialog.getByRole('button', { name: 'Send invite' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('status').filter({ hasText: 'Invitation sent to new.person@kalpana.example' })).toHaveCount(1)
  })

  test('deactivate: after confirming, focus lands on the confirmation, not <body> (2.4.3)', async ({ page, context }) => {
    await signIn(context, 'owner')
    await page.goto('/staff')
    await waitForSettled(page, 'Staff')
    await page.getByRole('button', { name: 'Deactivate ravi@kalpana.example' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Deactivate', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('ravi@kalpana.example has been deactivated', { exact: false }).last()).toBeFocused()
  })

  test('pagination keeps focus on the pager after paging (2.4.3) and announces the page (4.1.3)', async ({ page, context }) => {
    await signIn(context, 'owner')
    await page.goto('/orders')
    await waitForSettled(page, 'Orders')
    const next = page.getByRole('button', { name: 'Next page' })
    await next.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/page=2/)
    await expect(next).toBeFocused()
    await expect(page.getByRole('navigation', { name: 'Pagination' }).locator('[aria-live="polite"]')).toContainText('Page 2 of')
    const prev = page.getByRole('button', { name: 'Previous page' })
    await prev.focus()
    await page.keyboard.press('Enter')
    await expect(page).not.toHaveURL(/page=2/)
    // On page 1 "Previous" is aria-disabled but still focused, rather than focus dropping to <body>.
    await expect(prev).toBeFocused()
    await expect(prev).toHaveAttribute('aria-disabled', 'true')
  })

  test('order status update result is announced (4.1.3)', async ({ page, context }) => {
    await signIn(context, 'owner')
    await page.goto('/orders/asg-0001')
    await waitForSettled(page, 'GFT-0001')
    await page.getByRole('button', { name: 'Acknowledge order' }).click()
    await expect(page.getByRole('status').filter({ hasText: /Status updated/ })).toHaveCount(1)
  })
})

test.describe('reflow, mobile and motion', () => {
  const REFLOW_PAGES = [
    { path: '/login', ready: 'Sign in' },
    { path: `/onboarding/register?organizationId=${ORG_ID}`, ready: 'Become a dealer' },
    { token: 'rejected', path: '/onboarding/status', ready: 'Application status' },
    { token: 'underreview', path: '/onboarding/documents', ready: 'KYC documents' },
    { token: 'owner', path: '/', ready: 'Dashboard' },
    { token: 'owner', path: '/orders', ready: 'Orders' },
    { token: 'owner', path: '/orders/asg-0003', ready: 'GFT-0003' },
    { token: 'owner', path: '/profile', ready: 'Profile' },
    { token: 'owner', path: '/profile/capabilities', ready: 'Edit capabilities' },
    { token: 'owner', path: '/staff', ready: 'Staff' },
    { token: 'owner', path: '/earnings', ready: 'Earnings' },
    { token: 'owner', path: '/ledger', ready: 'Ledger' },
  ]

  for (const { token, path, ready } of REFLOW_PAGES) {
    test(`no page-level horizontal scroll at 320px: ${path} (1.4.10)`, async ({ page, context }) => {
      await page.setViewportSize({ width: 320, height: 640 })
      if (token) await signIn(context, token)
      await page.goto(path)
      await waitForSettled(page, ready)
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      // Data tables may scroll inside their own TableContainer (a 1.4.10 exception); the page may not.
      expect(scrollWidth, `page is ${scrollWidth}px wide at a ${clientWidth}px viewport`).toBeLessThanOrEqual(clientWidth + 1)
    })
  }

  test('mobile menu toggle exposes state and its links are keyboard reachable (4.1.2, 2.1.1)', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 700 })
    await signIn(context, 'owner')
    await page.goto('/')
    await waitForSettled(page, 'Dashboard')
    const toggle = page.getByRole('button', { name: 'Open menu' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.focus()
    await page.keyboard.press('Enter')
    const close = page.getByRole('button', { name: 'Close menu' })
    await expect(close).toHaveAttribute('aria-expanded', 'true')
    const nav = page.locator('#portal-nav-mobile').getByRole('navigation', { name: 'Dealer portal' })
    await expect(nav.getByRole('link', { name: 'Orders' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused()
  })

  test('prefers-reduced-motion disables animation (2.3.3)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/login')
    await waitForSettled(page, 'Sign in')
    const duration = await page.evaluate(() => {
      const el = document.createElement('div')
      el.className = 'animate-spin'
      document.body.appendChild(el)
      const value = getComputedStyle(el).animationDuration
      el.remove()
      return value
    })
    expect(parseFloat(duration)).toBeLessThan(0.01)
  })
})
