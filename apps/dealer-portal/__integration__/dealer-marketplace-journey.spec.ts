import { test, expect, type APIRequestContext } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pgCall } from './fixtures/pg'

/**
 * P2-UI-17: the real, live, multi-actor dealer-marketplace journey.
 *
 * Runs against the real `apps/mercato` backend + a real (ephemeral, disposable) Postgres
 * database — no mocks, no fixture server. Intended vehicle: `yarn test:integration:ephemeral`
 * (apps/mercato), which boots a real ephemeral Postgres + production build of the real app and
 * sets `BASE_URL`/`DATABASE_URL` for every discovered `__integration__` spec, this one included.
 *
 * This closes the single most-repeated deferred item across the whole P2-UI task pack: every
 * prior task (P2-UI-04 through P2-UI-16) verified dealer registration/KYC/approval/capabilities/
 * staff/order-assignment/commission/ledger/status-transition behavior by reading backend source
 * and/or running unit tests against a mocked EntityManager — never a real two-dealer, real-HTTP,
 * real-Postgres session. This spec is that session.
 *
 * No real payment gateway is available in this sandbox, so the one unavoidable gap is creating a
 * "paid" order: there is no live Stripe/Razorpay checkout to drive, so a real `sales_orders` row
 * is inserted directly (via fixtures/pg.ts) with `payment_status='paid'` — exactly the shape
 * `assertOrderIsPaid` checks. Everything downstream of that (assignment, commission snapshot,
 * ledger credit, dealer status transitions, payout recording, cross-dealer isolation) goes
 * through the real HTTP routes and real command handlers, nothing mocked.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5001'
const EMAIL_CAPTURE_PATH =
  process.env.OM_TEST_EMAIL_CAPTURE_PATH ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'mercato', '.ai', 'qa', 'email-capture.jsonl')

type Jar = Record<string, string>

function cookieHeader(jar: Jar): string {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
}

async function loginAs(request: APIRequestContext, email: string, password: string): Promise<Jar | null> {
  const res = await request.post(`${BASE_URL}/api/auth/login`, {
    form: { email, password },
  })
  if (res.status() !== 200) return null
  const jar: Jar = {}
  for (const h of res.headersArray().filter((entry) => entry.name.toLowerCase() === 'set-cookie')) {
    const [pair] = h.value.split(';')
    const idx = pair.indexOf('=')
    if (idx > 0) jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim()
  }
  return jar
}

function readLatestEmailFor(recipient: string): unknown | null {
  if (!existsSync(EMAIL_CAPTURE_PATH)) return null
  const lines = readFileSync(EMAIL_CAPTURE_PATH, 'utf8').trim().split('\n').filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i])
      if (JSON.stringify(entry).toLowerCase().includes(recipient.toLowerCase())) return entry
    } catch {
      // skip malformed line
    }
  }
  return null
}

function extractToken(entry: unknown): string | null {
  const text = JSON.stringify(entry)
  const m = text.match(/token=([A-Za-z0-9_\-.]{10,})/) || text.match(/reset\/([A-Za-z0-9_\-.]{10,})/)
  return m ? m[1] : null
}

async function completeInvite(request: APIRequestContext, email: string, password: string): Promise<Jar | null> {
  const entry = readLatestEmailFor(email)
  if (!entry) return null
  const token = extractToken(entry)
  if (!token) return null
  const confirm = await request.post(`${BASE_URL}/api/auth/reset/confirm`, { form: { token, password } })
  if (confirm.status() !== 200) return null
  return loginAs(request, email, password)
}

test.describe.serial('P2-UI-17: real dealer marketplace journey (live Postgres + live backend)', () => {
  let tenantId: string
  let marketplaceOrgId: string
  let adminJar: Jar
  let dealerAProfileId: string
  let dealerBProfileId: string
  let ownerAEmail: string
  let ownerBEmail: string
  let ownerAJar: Jar | null = null
  let ownerBJar: Jar | null = null
  let orderId: string
  let assignmentId: string

  test('resolves the seeded tenant + marketplace org, and logs in as the real superadmin', async ({ request }) => {
    const resolved = pgCall<{ tenantId: string; organizationId: string }>('resolve-tenant-org')
    tenantId = resolved.tenantId
    marketplaceOrgId = resolved.organizationId
    expect(tenantId).toBeTruthy()

    const jar = await loginAs(request, 'superadmin@acme.com', 'secret')
    expect(jar).not.toBeNull()
    adminJar = jar!
  })

  test('anonymous caller is rejected on every dealer-facing route', async ({ request }) => {
    const status = await request.get(`${BASE_URL}/api/dealer_onboarding/dealer/onboarding/status`)
    expect(status.status()).toBe(401)
    const dashboard = await request.get(`${BASE_URL}/api/dealer_orders/dealer/dashboard`)
    expect(dashboard.status()).toBe(401)
  })

  test('registers two dealers in the SAME tenant (dealer A and dealer B)', async ({ request }) => {
    ownerAEmail = `dealer-a-${Date.now()}@test.local`
    const regA = await request.post(`${BASE_URL}/api/dealer_onboarding/dealer/onboarding/register`, {
      data: {
        organizationId: marketplaceOrgId,
        businessName: 'Dealer A Printing Co',
        contactEmail: ownerAEmail,
        phone: '9876500001',
        gstin: '27AAAPA1234A1Z5',
        pan: 'AAAPA1234A',
        businessType: 'pvt_ltd',
        city: 'Mumbai',
        state: 'MH',
        pincode: '400001',
      },
    })
    expect(regA.status()).toBe(201)
    dealerAProfileId = (await regA.json()).id

    ownerBEmail = `dealer-b-${Date.now()}@test.local`
    const regB = await request.post(`${BASE_URL}/api/dealer_onboarding/dealer/onboarding/register`, {
      data: {
        organizationId: marketplaceOrgId,
        businessName: 'Dealer B Gift Works',
        contactEmail: ownerBEmail,
        phone: '9876500002',
        gstin: '29BBBPB5678B1Z3',
        pan: 'BBBPB5678B',
        businessType: 'proprietorship',
        city: 'Bengaluru',
        state: 'KA',
        pincode: '560001',
      },
    })
    expect(regB.status()).toBe(201)
    dealerBProfileId = (await regB.json()).id
    expect(dealerAProfileId).not.toBe(dealerBProfileId)
  })

  test('admin cannot approve before KYC document upload (still pending_verification)', async ({ request }) => {
    const earlyApprove = await request.post(
      `${BASE_URL}/api/dealer_onboarding/admin/dealers/applications/${dealerAProfileId}/approve`,
      { headers: { cookie: cookieHeader(adminJar) } },
    )
    expect(earlyApprove.status()).toBe(400)
  })

  test('dealer A completes real invite password-setup, uploads a real KYC document, and gets approved', async ({ request }) => {
    const password = 'DealerA!Pass123'
    ownerAJar = await completeInvite(request, ownerAEmail, password)
    expect(ownerAJar, 'invite email was captured and the password-setup/login round trip succeeded').not.toBeNull()

    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    const upload = await request.post(`${BASE_URL}/api/dealer_onboarding/dealer/onboarding/documents`, {
      headers: { cookie: cookieHeader(ownerAJar!) },
      multipart: { documentType: 'gst_certificate', file: { name: 'gst.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(bytes) } },
    })
    expect(upload.status()).toBe(201)

    const approve = await request.post(
      `${BASE_URL}/api/dealer_onboarding/admin/dealers/applications/${dealerAProfileId}/approve`,
      { headers: { cookie: cookieHeader(adminJar) } },
    )
    expect(approve.status()).toBe(200)
  })

  test('dealer B goes through pending -> rejected -> resubmitted -> approved', async ({ request }) => {
    const password = 'DealerB!Pass123'
    ownerBJar = await completeInvite(request, ownerBEmail, password)
    expect(ownerBJar).not.toBeNull()

    const upload = await request.post(`${BASE_URL}/api/dealer_onboarding/dealer/onboarding/documents`, {
      headers: { cookie: cookieHeader(ownerBJar!) },
      multipart: { documentType: 'pan_card', file: { name: 'pan.pdf', mimeType: 'application/pdf', buffer: Buffer.from([1, 2, 3, 4, 5]) } },
    })
    expect(upload.status()).toBe(201)

    const reject = await request.post(
      `${BASE_URL}/api/dealer_onboarding/admin/dealers/applications/${dealerBProfileId}/reject`,
      { headers: { cookie: cookieHeader(adminJar) }, data: { reason: 'Address proof missing' } },
    )
    expect(reject.status()).toBe(200)

    // A rejected dealer cannot yet read their org profile.
    const rejectedProfile = await request.get(`${BASE_URL}/api/dealer_org_rbac/dealer/profile`, {
      headers: { cookie: cookieHeader(ownerBJar!) },
    })
    expect(rejectedProfile.status()).toBe(404)

    const resubmit = await request.post(`${BASE_URL}/api/dealer_onboarding/dealer/onboarding/resubmit`, {
      headers: { cookie: cookieHeader(ownerBJar!) },
      data: { note: 'added address proof' },
    })
    expect(resubmit.status()).toBe(200)

    const approve = await request.post(
      `${BASE_URL}/api/dealer_onboarding/admin/dealers/applications/${dealerBProfileId}/approve`,
      { headers: { cookie: cookieHeader(adminJar) } },
    )
    expect(approve.status()).toBe(200)
  })

  test('dealer A configures real capabilities; staff cannot mutate them; owner invites and deactivates real staff', async ({ request }) => {
    const capPut = await request.put(`${BASE_URL}/api/dealer_org_rbac/dealer/profile/capabilities`, {
      headers: { cookie: cookieHeader(ownerAJar!) },
      data: { productTypeCodes: ['mug'], printingMethods: ['sublimation'], maxDailyCapacity: 50, serviceableStates: ['IN-MH'], minOrderQty: 1 },
    })
    expect(capPut.status()).toBe(200)

    const staffEmail = `staff-a-${Date.now()}@test.local`
    const invite = await request.post(`${BASE_URL}/api/dealer_org_rbac/dealer/staff/invite`, {
      headers: { cookie: cookieHeader(ownerAJar!) },
      data: { email: staffEmail, name: 'Staff A One' },
    })
    expect(invite.status()).toBe(201)
    const { userId } = await invite.json()
    expect(userId, 'staff invite response carries a real userId (regression guard for the result.id -> result.user.id fix)').toBeTruthy()

    const staffJar = await completeInvite(request, staffEmail, 'StaffA!Pass123')
    expect(staffJar).not.toBeNull()

    const staffCapPut = await request.put(`${BASE_URL}/api/dealer_org_rbac/dealer/profile/capabilities`, {
      headers: { cookie: cookieHeader(staffJar!) },
      data: { productTypeCodes: ['mug'], printingMethods: ['sublimation'], maxDailyCapacity: 999, serviceableStates: ['IN-MH'], minOrderQty: 1 },
    })
    expect(staffCapPut.status(), 'a staff (non-owner) caller cannot mutate capabilities even via a direct request').toBe(403)

    const deactivate = await request.post(`${BASE_URL}/api/dealer_org_rbac/dealer/staff/${userId}/deactivate`, {
      headers: { cookie: cookieHeader(ownerAJar!) },
    })
    expect(deactivate.status()).toBe(200)

    const reLogin = await loginAs(request, staffEmail, 'StaffA!Pass123')
    expect(reLogin, 'a deactivated staff user cannot log in again').toBeNull()
  })

  test('a real paid order is created, assigned to dealer A, and the real commission+ledger chain lands in Postgres', async ({ request }) => {
    const { orderId: createdOrderId } = pgCall<{ orderId: string }>('create-paid-order', {
      organizationId: marketplaceOrgId,
      tenantId,
      orderNumber: `SO-P2UI17-${Date.now()}`,
      subtotalPaise: 125000,
    })
    orderId = createdOrderId

    const requiredBy = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    const assign = await request.post(`${BASE_URL}/api/dealer_orders/admin/orders/${orderId}/assignment`, {
      headers: { cookie: cookieHeader(adminJar), 'Idempotency-Key': `assign-${orderId}` },
      data: { orderId, dealerProfileId: dealerAProfileId, requiredBy },
    })
    expect(assign.status()).toBe(201)
    assignmentId = (await assign.json()).id

    await new Promise((resolve) => setTimeout(resolve, 1000))

    const snapshot = pgCall<{ rows: unknown[] }>('get-commission-snapshot', { assignmentId })
    expect(snapshot.rows.length, 'a real commission snapshot row was created for this real assignment').toBe(1)

    const ledger = pgCall<{ rows: unknown[] }>('get-latest-ledger-entry', {
      dealerProfileId: dealerAProfileId,
      entryType: 'commission_earned',
    })
    expect(ledger.rows.length, 'a real commission_earned ledger credit row was created').toBe(1)
  })

  test('dealer A sees the real order/earnings/ledger/dashboard; data is real, not a placeholder', async ({ request }) => {
    const earnings = await request.get(`${BASE_URL}/api/commissions/dealer/earnings`, { headers: { cookie: cookieHeader(ownerAJar!) } })
    expect(earnings.status()).toBe(200)
    const earningsBody = await earnings.json()
    expect(earningsBody.items.length).toBeGreaterThanOrEqual(1)

    const balance = await request.get(`${BASE_URL}/api/payouts/dealer/ledger/balance`, { headers: { cookie: cookieHeader(ownerAJar!) } })
    expect(balance.status()).toBe(200)

    const dashboard = await request.get(`${BASE_URL}/api/dealer_orders/dealer/dashboard`, { headers: { cookie: cookieHeader(ownerAJar!) } })
    expect(dashboard.status(), 'the dealer dashboard allowlist route resolves for real (not a 404)').toBe(200)

    const ordersList = await request.get(`${BASE_URL}/api/dealer_orders/dealer/orders`, { headers: { cookie: cookieHeader(ownerAJar!) } })
    expect(ordersList.status()).toBe(200)
    const ordersBody = await ordersList.json()
    expect(ordersBody.items.some((item: { id: string }) => item.id === assignmentId)).toBe(true)
  })

  test('ISOLATION: dealer B (same tenant, different dealer org) cannot see any of dealer A real data', async ({ request }) => {
    const orderDetail = await request.get(`${BASE_URL}/api/dealer_orders/dealer/orders/${assignmentId}`, {
      headers: { cookie: cookieHeader(ownerBJar!) },
    })
    expect(orderDetail.status(), 'cross-dealer order detail read is blocked').toBe(404)

    const ordersList = await request.get(`${BASE_URL}/api/dealer_orders/dealer/orders`, { headers: { cookie: cookieHeader(ownerBJar!) } })
    expect(ordersList.status()).toBe(200)
    const ordersBody = await ordersList.json()
    expect(ordersBody.items.some((item: { id: string }) => item.id === assignmentId)).toBe(false)

    const earnings = await request.get(`${BASE_URL}/api/commissions/dealer/earnings`, { headers: { cookie: cookieHeader(ownerBJar!) } })
    expect(earnings.status()).toBe(200)
    const earningsBody = await earnings.json()
    expect(earningsBody.items.some((item: { assignmentId: string }) => item.assignmentId === assignmentId)).toBe(false)

    const balance = await request.get(`${BASE_URL}/api/payouts/dealer/ledger/balance`, { headers: { cookie: cookieHeader(ownerBJar!) } })
    expect(balance.status()).toBe(200)
    const balanceBody = await balance.json()
    expect(balanceBody.pendingAmount, "dealer B's own balance is unaffected by dealer A's commission").toBe(0)

    const statusUpdate = await request.post(`${BASE_URL}/api/dealer_orders/dealer/orders/${assignmentId}/status`, {
      headers: { cookie: cookieHeader(ownerBJar!) },
      data: { status: 'acknowledged' },
    })
    expect([400, 404]).toContain(statusUpdate.status())
  })

  test('dealer A drives the real full status-transition sequence to dispatched, then it is terminal', async ({ request }) => {
    for (const status of ['acknowledged', 'in_production', 'ready_for_dispatch', 'dispatched']) {
      const r = await request.post(`${BASE_URL}/api/dealer_orders/dealer/orders/${assignmentId}/status`, {
        headers: { cookie: cookieHeader(ownerAJar!) },
        data: { status },
      })
      expect(r.status(), `transition -> ${status}`).toBe(200)
    }
    const backward = await request.post(`${BASE_URL}/api/dealer_orders/dealer/orders/${assignmentId}/status`, {
      headers: { cookie: cookieHeader(ownerAJar!) },
      data: { status: 'acknowledged' },
    })
    expect(backward.status(), 'dispatched is terminal').toBe(400)
  })

  test('admin records a real payout against the real earned balance', async ({ request }) => {
    const payout = await request.post(`${BASE_URL}/api/payouts/admin/dealers/${dealerAProfileId}/ledger/payout`, {
      headers: { cookie: cookieHeader(adminJar) },
      data: { amount: 10000, note: 'UTR-TEST-0001' },
    })
    expect(payout.status()).toBe(201)

    const balance = await request.get(`${BASE_URL}/api/payouts/admin/dealers/${dealerAProfileId}/ledger/balance`, {
      headers: { cookie: cookieHeader(adminJar) },
    })
    expect(balance.status()).toBe(200)
  })

  test.afterAll(async () => {
    if (orderId) {
      try {
        pgCall('delete-order', { orderId })
      } catch {
        // best-effort cleanup of the synthetic order row; everything else created through
        // real commands is left in place in this disposable ephemeral database.
      }
    }
  })
})
