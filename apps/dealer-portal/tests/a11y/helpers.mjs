import AxeBuilder from '@axe-core/playwright'
import { expect } from '@playwright/test'

/** WCAG 2.0/2.1/2.2, levels A and AA — the target for this suite. */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']

const ORG_ID = '00000000-0000-4000-8000-000000000002'

/** Selects a mock-API persona/variant (see mock-api.mjs) by setting the session cookie. */
export async function signIn(context, token) {
  const baseURL = test_baseURL()
  await context.addCookies([{ name: 'auth_token', value: token, url: baseURL, httpOnly: true, sameSite: 'Lax' }])
}

function test_baseURL() {
  return `http://localhost:${process.env.A11Y_PORT ?? 3210}`
}

/** Waits for the page's own "ready" signal, then for every loading spinner to disappear. */
export async function waitForSettled(page, ready) {
  if (ready) {
    const locator = typeof ready === 'string' ? page.getByRole('heading', { name: ready, level: 1 }) : ready(page)
    await expect(locator.first()).toBeVisible()
  }
  await expect(page.locator('[role="status"]', { hasText: /Loading/ })).toHaveCount(0)
}

function formatViolations(violations) {
  return violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 5).map((n) => `${n.target.join(' ')} :: ${n.failureSummary?.split('\n').slice(1, 3).join(' ')}`),
  }))
}

export async function auditPage(page, label) {
  // Scan the resting state: no hover styles or half-finished colour transitions from the last click.
  await page.mouse.move(0, 0)
  await page.waitForTimeout(250)
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    // Next's dev-mode indicator/overlay (absent from production builds).
    .exclude('nextjs-portal')
    .analyze()
  expect(formatViolations(results.violations), `axe violations on ${label}`).toEqual([])
}

const text = (value) => (page) => page.getByText(value)
/** A visible error alert (Next's own empty route-announcer also has role=alert — skip it). */
const alert = (page) => page.locator('[role="alert"]:not(#__next-route-announcer__)')

/**
 * Every page × key state. `token` = mock persona[.variant]; omitted = anonymous.
 * `ready` = an h1 name (string/RegExp → heading) or a locator factory.
 * `act` = an interaction run after the page settles and before the scan (form errors, dialogs).
 */
export const CASES = [
  // --- (auth) ------------------------------------------------------------------------------
  { name: 'login', path: '/login', ready: 'Sign in' },
  { name: 'login: session-expired notice', path: '/login?reason=expired', ready: 'Sign in' },
  {
    name: 'login: invalid credentials error',
    path: '/login',
    ready: 'Sign in',
    act: async (page) => {
      await page.getByLabel('Email').fill('wrong@example.com')
      await page.getByLabel('Password').fill('nope')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password' })).toBeVisible()
    },
  },
  { name: 'forgot-password', path: '/forgot-password', ready: 'Forgot your password?' },
  {
    name: 'forgot-password: sent confirmation',
    path: '/forgot-password',
    ready: 'Forgot your password?',
    act: async (page) => {
      await page.getByLabel('Email').fill('owner@kalpana.example')
      await page.getByRole('button', { name: 'Send reset link' }).click()
      await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
    },
  },
  { name: 'reset: valid token', path: '/reset/valid-token', ready: 'Set your password' },
  { name: 'reset: expired token', path: '/reset/expired-token', ready: 'Link expired' },
  {
    name: 'reset: validation error',
    path: '/reset/valid-token',
    ready: 'Set your password',
    act: async (page) => {
      await page.getByLabel('New password').fill('abcdefgh')
      await page.getByLabel('Confirm password').fill('different')
      await page.getByRole('button', { name: 'Set password' }).click()
      await expect(page.getByRole('alert').filter({ hasText: 'Passwords do not match' })).toBeVisible()
    },
  },
  { name: 'pending: under review', token: 'underreview', path: '/pending', ready: 'Application status' },
  { name: 'pending: rejected', token: 'rejected', path: '/pending', ready: 'Application status' },
  { name: 'access-denied: not a dealer', token: 'notdealer', path: '/access-denied?reason=not-a-dealer', ready: 'Access unavailable' },
  { name: 'access-denied: no profile', token: 'noprofile', path: '/access-denied?reason=no-profile', ready: 'Access unavailable' },
  { name: 'forbidden: staff on owner page', token: 'staff', path: '/earnings', expectUrl: /\/forbidden$/, ready: 'Owner access required' },
  { name: 'not-found', path: '/this-page-does-not-exist', ready: text("We can't find that page") },

  // --- (onboarding) --------------------------------------------------------------------------
  { name: 'register: incomplete link', path: '/onboarding/register', ready: text('Registration link is incomplete') },
  { name: 'register: form', path: `/onboarding/register?organizationId=${ORG_ID}`, ready: 'Become a dealer' },
  {
    name: 'register: validation errors',
    path: `/onboarding/register?organizationId=${ORG_ID}`,
    ready: 'Become a dealer',
    act: async (page) => {
      await page.getByRole('button', { name: 'Submit application' }).click()
      await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible()
    },
  },
  {
    name: 'register: duplicate email',
    path: `/onboarding/register?organizationId=${ORG_ID}`,
    ready: 'Become a dealer',
    act: async (page) => {
      await fillRegisterForm(page, 'taken@example.com')
      await page.getByRole('button', { name: 'Submit application' }).click()
      await expect(page.getByText('Already applied?')).toBeVisible()
    },
  },
  {
    name: 'register: submitted',
    path: `/onboarding/register?organizationId=${ORG_ID}`,
    ready: 'Become a dealer',
    act: async (page) => {
      await fillRegisterForm(page, 'new@example.com')
      await page.getByRole('button', { name: 'Submit application' }).click()
      await expect(page.getByRole('heading', { name: 'Registration submitted' })).toBeVisible()
    },
  },
  { name: 'onboarding status: pending, docs missing', token: 'pending', path: '/onboarding/status', ready: 'Application status' },
  { name: 'onboarding status: under review', token: 'underreview', path: '/onboarding/status', ready: 'Application status' },
  { name: 'onboarding status: rejected', token: 'rejected', path: '/onboarding/status', ready: 'Application status' },
  { name: 'onboarding status: approved', token: 'owner', path: '/onboarding/status', ready: 'Application status' },
  { name: 'onboarding status: load error', token: 'pending.error', path: '/onboarding/status', ready: alert },
  { name: 'documents: can upload', token: 'underreview', path: '/onboarding/documents', ready: 'KYC documents' },
  { name: 'documents: read-only (rejected)', token: 'rejected', path: '/onboarding/documents', ready: 'KYC documents' },
  {
    name: 'documents: invalid file selected',
    token: 'pending',
    path: '/onboarding/documents',
    ready: 'KYC documents',
    act: async (page) => {
      await page.locator('#file-gst_certificate').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
      await expect(page.getByRole('alert').filter({ hasText: 'Unsupported file type' })).toBeVisible()
    },
  },
  { name: 'documents: load error', token: 'pending.error', path: '/onboarding/documents', ready: alert },
  { name: 'resubmit: form', token: 'rejected', path: '/onboarding/resubmit', ready: 'Resubmit application' },
  {
    name: 'resubmit: validation errors',
    token: 'rejected',
    path: '/onboarding/resubmit',
    ready: 'Resubmit application',
    act: async (page) => {
      await page.getByLabel('Business name').fill('')
      await page.getByLabel('Phone').fill('x')
      await page.getByRole('button', { name: 'Resubmit application' }).click()
      await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible()
    },
  },

  // --- (portal) ------------------------------------------------------------------------------
  { name: 'dashboard: owner', token: 'owner', path: '/', ready: 'Dashboard' },
  { name: 'dashboard: staff', token: 'staff', path: '/', ready: 'Dashboard' },
  { name: 'dashboard: empty', token: 'owner.empty', path: '/', ready: 'Dashboard' },
  { name: 'dashboard: errors', token: 'owner.error', path: '/', ready: alert },
  { name: 'orders: loaded', token: 'owner', path: '/orders', ready: 'Orders' },
  { name: 'orders: empty', token: 'owner.empty', path: '/orders', ready: 'Orders' },
  { name: 'orders: filtered, no match', token: 'owner.empty', path: '/orders?status=dispatched', ready: 'Orders' },
  { name: 'orders: load error', token: 'owner.error', path: '/orders', ready: alert },
  { name: 'order detail: assigned', token: 'staff', path: '/orders/asg-0001', ready: 'GFT-0001' },
  { name: 'order detail: in production with note', token: 'owner', path: '/orders/asg-0003', ready: 'GFT-0003' },
  { name: 'order detail: dispatched', token: 'owner', path: '/orders/asg-0005', ready: 'GFT-0005' },
  { name: 'order detail: cancelled', token: 'owner', path: '/orders/asg-0006', ready: 'GFT-0006' },
  { name: 'order detail: not found', token: 'owner', path: '/orders/missing', ready: 'Order not found' },
  { name: 'order detail: load error', token: 'owner.error', path: '/orders/asg-0001', ready: alert },
  {
    name: 'order detail: conflict on status update',
    token: 'owner',
    path: '/orders/asg-0002',
    ready: 'GFT-0002',
    act: async (page) => {
      await page.getByRole('button', { name: 'Start production' }).click()
      await expect(page.getByRole('alert').filter({ hasText: 'updated elsewhere' })).toBeVisible()
    },
  },
  { name: 'profile: owner', token: 'owner', path: '/profile', ready: 'Profile' },
  { name: 'profile: staff', token: 'staff', path: '/profile', ready: 'Profile' },
  { name: 'profile: capabilities not configured', token: 'owner.empty', path: '/profile', ready: 'Profile' },
  { name: 'profile: load error', token: 'owner.error', path: '/profile', ready: alert },
  { name: 'capabilities: edit', token: 'owner', path: '/profile/capabilities', ready: 'Edit capabilities' },
  { name: 'capabilities: first-time setup', token: 'owner.empty', path: '/profile/capabilities', ready: 'Edit capabilities' },
  {
    name: 'capabilities: validation errors',
    token: 'owner',
    path: '/profile/capabilities',
    ready: 'Edit capabilities',
    act: async (page) => {
      await page.getByLabel('Max daily capacity').fill('')
      await page.getByLabel('Minimum order quantity').fill('0')
      await page.getByRole('button', { name: 'Save capabilities' }).click()
      await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible()
    },
  },
  {
    name: 'capabilities: saved',
    token: 'owner',
    path: '/profile/capabilities',
    ready: 'Edit capabilities',
    act: async (page) => {
      await page.getByLabel('Max daily capacity').fill('150')
      await page.getByRole('button', { name: 'Save capabilities' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Capabilities saved' })).toBeVisible()
    },
  },
  { name: 'capabilities: load error', token: 'owner.error', path: '/profile/capabilities', ready: alert },
  { name: 'staff: roster', token: 'owner', path: '/staff', ready: 'Staff' },
  { name: 'staff: only owner', token: 'owner.empty', path: '/staff', ready: 'Staff' },
  { name: 'staff: load error', token: 'owner.error', path: '/staff', ready: alert },
  {
    name: 'staff: invite dialog with errors',
    token: 'owner',
    path: '/staff',
    ready: 'Staff',
    act: async (page) => {
      await page.getByRole('button', { name: 'Invite staff' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'Send invite' }).click()
      await expect(dialog.locator('[aria-invalid="true"]')).toBeVisible()
    },
  },
  {
    name: 'staff: deactivate dialog',
    token: 'owner',
    path: '/staff',
    ready: 'Staff',
    act: async (page) => {
      await page.getByRole('button', { name: 'Deactivate ravi@kalpana.example' }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
  },
  { name: 'earnings: loaded', token: 'owner', path: '/earnings', ready: 'Earnings' },
  { name: 'earnings: empty', token: 'owner.empty', path: '/earnings', ready: 'Earnings' },
  { name: 'earnings: load error', token: 'owner.error', path: '/earnings', ready: alert },
  { name: 'ledger: loaded', token: 'owner', path: '/ledger', ready: 'Ledger' },
  { name: 'ledger: empty', token: 'owner.empty', path: '/ledger', ready: 'Ledger' },
  { name: 'ledger: load error', token: 'owner.error', path: '/ledger', ready: alert },
]


async function fillRegisterForm(page, email) {
  await page.getByLabel('Business name').fill('Kalpana Prints & Gifts')
  await page.getByLabel('Contact email').fill(email)
  await page.getByLabel('Phone').fill('+91 98765 43210')
  await page.getByLabel('Business type').selectOption('proprietorship')
  await page.getByLabel('GSTIN').fill('27ABCDE1234F1Z5')
  await page.getByLabel('PAN').fill('ABCDE1234F')
  await page.getByLabel('City').fill('Pune')
  await page.getByLabel('State').selectOption('MH')
  await page.getByLabel('Pincode').fill('411001')
}
