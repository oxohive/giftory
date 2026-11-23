import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test'
import { pgCall } from './fixtures/pg'
import {
  BASE_URL,
  assertThrowawayEnvironment,
  bodyText,
  capturedEmailsFor,
  completeInvite,
  cookieHeader,
  loginAs,
  provisionTenant,
  type Jar,
  type ProvisionedTenant,
} from './fixtures/isolation-env'

/**
 * Milestone 1 / WS-E: cross-tenant and cross-dealer isolation for every Phase 2 route.
 *
 * Closes the TASK-17 gap "a second tenant was never created": this spec provisions two
 * brand-new tenants (A and B) with the real `mercato auth setup` CLI, registers three real
 * dealers through the real HTTP API (A1 and A2 in tenant A, B1 in tenant B), carries each
 * through invite -> KYC upload -> approval -> capabilities -> staff -> paid order assignment
 * -> commission snapshot -> ledger credit, and then asserts that:
 *
 *   - a tenant-B admin can never read, approve, reject, edit, reassign, cancel, deactivate or
 *     pay out tenant-A data (403/404 — never a 2xx carrying tenant-A data), and vice versa;
 *   - a tenant-B dealer can never see or mutate tenant-A dealer data;
 *   - two dealers in the SAME tenant (A1, A2) never see each other's orders, earnings,
 *     ledger, staff or KYC documents;
 *   - after every denied write, the owning tenant's own view of the record is unchanged.
 *
 * Every denial is paired with a positive control (the owner CAN see the same record), so a
 * route that is simply broken cannot pass as "isolated".
 *
 * Known gaps are kept separate: some admin write routes accept a `dealerProfileId` that
 * belongs to ANOTHER tenant (no ownership check). That never exposes or changes the other
 * tenant's data (every read is filtered by the caller's tenant_id, which the "invariant" test
 * below proves), but it does create orphan rows. Those are recorded in the
 * `foreign-dealer writes` test and asserted in the final `test.fail()` test, which turns into
 * an "unexpected pass" — i.e. a prompt to make the assertion permanent — once they are fixed.
 * See tasks/milestone-1/WS-E-migrations-isolation-e2e.md.
 *
 * Vehicle: `yarn test:integration:ephemeral` (apps/mercato). The spec refuses to run unless
 * DATABASE_URL and BASE_URL are local (see fixtures/isolation-env.ts). The only DB writes made
 * directly (not through the API) are synthetic paid `sales_orders` rows — there is no live
 * payment gateway in the ephemeral environment — exactly as in dealer-marketplace-journey.spec.ts.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`

type Dealer = {
  key: string
  tenant: ProvisionedTenant
  email: string
  password: string
  profileId: string
  jar: Jar
  documentId: string
}

function isoDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)
}

function headers(jar: Jar, extra: Record<string, string> = {}): Record<string, string> {
  return { cookie: cookieHeader(jar), ...extra }
}

function idem(prefix: string): Record<string, string> {
  return { 'Idempotency-Key': `${prefix}-${RUN_ID}-${Math.random().toString(36).slice(2, 10)}` }
}

/** Asserts the response text contains none of the given identifiers. */
function expectNoLeak(text: string, forbidden: Record<string, string>, context: string): void {
  for (const [label, value] of Object.entries(forbidden)) {
    if (!value) continue
    expect(text.includes(value), `${context}: response must not contain ${label}`).toBe(false)
  }
}

/** Denied = 403/404 with no foreign identifiers in the body. */
async function expectDenied(res: APIResponse, forbidden: Record<string, string>, context: string): Promise<void> {
  expect([403, 404], `${context}: expected 403/404, got ${res.status()}`).toContain(res.status())
  expectNoLeak(await bodyText(res), forbidden, context)
}

/** Rejected = any 4xx (validation, not-found, forbidden), never 2xx/5xx, with no foreign identifiers. */
async function expectRejected(res: APIResponse, forbidden: Record<string, string>, context: string): Promise<void> {
  const status = res.status()
  expect(status >= 400 && status < 500, `${context}: expected a 4xx rejection, got ${status}`).toBe(true)
  expectNoLeak(await bodyText(res), forbidden, context)
}

async function getJson(request: APIRequestContext, url: string, jar: Jar): Promise<{ status: number; text: string; json: any }> {
  const res = await request.get(`${BASE_URL}${url}`, { headers: headers(jar) })
  const text = await bodyText(res)
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { status: res.status(), text, json }
}

async function pollUntil<T>(fn: () => Promise<T | null>, timeoutMs = 15_000): Promise<T | null> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await fn()
    if (value !== null) return value
    if (Date.now() > deadline) return null
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

test.describe.serial('WS-E: cross-tenant + cross-dealer isolation across every Phase 2 route', () => {
  let tenantA: ProvisionedTenant
  let tenantB: ProvisionedTenant
  let adminA: Jar
  let adminB: Jar
  let ruleA: string
  let ruleB: string
  const dealers: Record<'A1' | 'A2' | 'B1', Dealer> = {} as Record<'A1' | 'A2' | 'B1', Dealer>
  let staffA1UserId: string
  let staffA1Email: string
  const orders: Record<'OA1' | 'OA2' | 'OB1' | 'OB2', string> = {} as Record<'OA1' | 'OA2' | 'OB1' | 'OB2', string>
  const assignments: Record<'OA1' | 'OA2' | 'OB1', string> = {} as Record<'OA1' | 'OA2' | 'OB1', string>
  let a1BalanceBefore: { pendingAmount: number; totalEarned: number }
  let a1LedgerTotalBefore: number
  const foreignWrites: Array<{ action: string; status: number }> = []

  /** Identifiers belonging to tenant A / dealer A1 that tenant B must never see. */
  const tenantAIds = (): Record<string, string> => ({
    'tenant A id': tenantA.tenantId,
    'dealer A1 profile id': dealers.A1?.profileId,
    'dealer A2 profile id': dealers.A2?.profileId,
    'dealer A1 email': dealers.A1?.email,
    'dealer A2 email': dealers.A2?.email,
    'order OA1 id': orders.OA1,
    'order OA2 id': orders.OA2,
    'assignment OA1 id': assignments.OA1,
    'assignment OA2 id': assignments.OA2,
    'dealer A1 KYC document id': dealers.A1?.documentId,
    'tenant A commission rule id': ruleA,
  })

  const dealerA1Ids = (): Record<string, string> => ({
    'dealer A1 profile id': dealers.A1.profileId,
    'dealer A1 email': dealers.A1.email,
    'order OA1 id': orders.OA1,
    'assignment OA1 id': assignments.OA1,
    'dealer A1 KYC document id': dealers.A1.documentId,
    'dealer A1 staff user id': staffA1UserId,
    'dealer A1 staff email': staffA1Email,
  })

  const dealerA2Ids = (): Record<string, string> => ({
    'dealer A2 profile id': dealers.A2.profileId,
    'order OA2 id': orders.OA2,
    'assignment OA2 id': assignments.OA2,
  })

  test('provisions two fresh tenants (A, B) via the real mercato CLI and logs in their tenant admins', async ({ request }) => {
    test.setTimeout(600_000)
    assertThrowawayEnvironment()

    tenantA = provisionTenant('A', RUN_ID)
    tenantB = provisionTenant('B', RUN_ID)
    expect(tenantA.tenantId).not.toBe(tenantB.tenantId)

    const jarA = await loginAs(request, tenantA.adminEmail, tenantA.adminPassword)
    const jarB = await loginAs(request, tenantB.adminEmail, tenantB.adminPassword)
    expect(jarA, 'tenant A admin can log in').not.toBeNull()
    expect(jarB, 'tenant B admin can log in').not.toBeNull()
    adminA = jarA!
    adminB = jarB!

    // A tenant-wide 10% commission rule in each tenant, so every snapshot/ledger credit is non-zero.
    for (const [jar, label] of [[adminA, 'A'], [adminB, 'B']] as const) {
      const res = await request.post(`${BASE_URL}/api/commissions/admin/commission/rules`, {
        headers: headers(jar, idem(`rule-${label}`)),
        data: { rateBps: 1000, effectiveFrom: isoDate(-1) },
      })
      expect(res.status(), `tenant ${label} admin creates its own commission rule`).toBe(201)
      const { id } = await res.json()
      if (label === 'A') ruleA = id
      else ruleB = id
    }
  })

  test('registers dealers A1 + A2 (tenant A) and B1 (tenant B), completes invites, uploads KYC', async ({ request }) => {
    test.setTimeout(180_000)
    const specs: Array<{ key: 'A1' | 'A2' | 'B1'; tenant: ProvisionedTenant; gstin: string; pan: string; state: string; pincode: string }> = [
      { key: 'A1', tenant: tenantA, gstin: '27AAAPA1234A1Z5', pan: 'AAAPA1234A', state: 'MH', pincode: '400001' },
      { key: 'A2', tenant: tenantA, gstin: '24CCCPC9012C1Z1', pan: 'CCCPC9012C', state: 'GJ', pincode: '380001' },
      { key: 'B1', tenant: tenantB, gstin: '29BBBPB5678B1Z3', pan: 'BBBPB5678B', state: 'KA', pincode: '560001' },
    ]
    for (const spec of specs) {
      const email = `dealer-${spec.key.toLowerCase()}-${RUN_ID}@test.local`
      const reg = await request.post(`${BASE_URL}/api/dealer_onboarding/dealer/onboarding/register`, {
        data: {
          organizationId: spec.tenant.organizationId,
          businessName: `Isolation Dealer ${spec.key} ${RUN_ID}`,
          contactEmail: email,
          phone: '9876500100',
          gstin: spec.gstin,
          pan: spec.pan,
          businessType: 'pvt_ltd',
          city: 'Testcity',
          state: spec.state,
          pincode: spec.pincode,
        },
      })
      expect(reg.status(), `dealer ${spec.key} registration`).toBe(201)
      const profileId = (await reg.json()).id as string

      const password = `Dealer${spec.key}!Pass123`
      const jar = await completeInvite(request, email, password)
      expect(jar, `dealer ${spec.key} invite email captured and password set`).not.toBeNull()

      const upload = await request.post(`${BASE_URL}/api/dealer_onboarding/dealer/onboarding/documents`, {
        headers: headers(jar!),
        multipart: {
          documentType: 'gst_certificate',
          file: { name: `gst-${spec.key}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4 ${spec.key}`) },
        },
      })
      expect(upload.status(), `dealer ${spec.key} KYC upload`).toBe(201)
      const documentId = (await upload.json()).id as string

      dealers[spec.key] = { key: spec.key, tenant: spec.tenant, email, password, profileId, jar: jar!, documentId }
    }
    expect(dealers.A1.profileId).not.toBe(dealers.A2.profileId)
  })

  test('ISOLATION onboarding/KYC review: the other tenant cannot list, read, download, approve or reject', async ({ request }) => {
    const A1 = dealers.A1
    const B1 = dealers.B1

    // Positive controls: tenant A admin sees A1's application and document.
    const ownDetail = await getJson(request, `/api/dealer_onboarding/admin/dealers/applications/${A1.profileId}`, adminA)
    expect(ownDetail.status).toBe(200)
    expect(ownDetail.json.kycStatus).toBe('under_review')
    expect(ownDetail.text).toContain(A1.documentId)

    // Tenant B admin: list contains B1 only.
    const listB = await getJson(request, '/api/dealer_onboarding/admin/dealers/applications?pageSize=100', adminB)
    expect(listB.status).toBe(200)
    expect(listB.text, 'tenant B admin sees its own dealer B1').toContain(B1.profileId)
    expectNoLeak(listB.text, tenantAIds(), 'tenant B admin: applications list')

    // Tenant B admin: every per-application route on A1 is denied.
    await expectDenied(
      await request.get(`${BASE_URL}/api/dealer_onboarding/admin/dealers/applications/${A1.profileId}`, { headers: headers(adminB) }),
      tenantAIds(),
      'tenant B admin: read A1 application',
    )
    await expectDenied(
      await request.get(
        `${BASE_URL}/api/dealer_onboarding/admin/dealers/applications/${A1.profileId}/documents/${A1.documentId}/file`,
        { headers: headers(adminB) },
      ),
      tenantAIds(),
      'tenant B admin: download A1 KYC document',
    )
    await expectDenied(
      await request.post(`${BASE_URL}/api/dealer_onboarding/admin/dealers/applications/${A1.profileId}/approve`, {
        headers: headers(adminB),
      }),
      tenantAIds(),
      'tenant B admin: approve A1',
    )
    await expectDenied(
      await request.post(`${BASE_URL}/api/dealer_onboarding/admin/dealers/applications/${A1.profileId}/reject`, {
        headers: headers(adminB),
        data: { reason: 'cross-tenant rejection attempt' },
      }),
      tenantAIds(),
      'tenant B admin: reject A1',
    )
    // Symmetric: tenant A admin cannot read B1.
    await expectDenied(
      await request.get(`${BASE_URL}/api/dealer_onboarding/admin/dealers/applications/${B1.profileId}`, { headers: headers(adminA) }),
      { 'tenant B id': tenantB.tenantId, 'dealer B1 email': B1.email },
      'tenant A admin: read B1 application',
    )

    // A1's application is untouched by the denied approve/reject.
    const afterDetail = await getJson(request, `/api/dealer_onboarding/admin/dealers/applications/${A1.profileId}`, adminA)
    expect(afterDetail.json.kycStatus, 'A1 is still under_review after the denied cross-tenant approve/reject').toBe('under_review')

    // Dealer-level KYC document isolation: owner can download; other-tenant dealer and same-tenant dealer cannot.
    const ownFile = await request.get(`${BASE_URL}/api/dealer_onboarding/dealer/onboarding/documents/${A1.documentId}/file`, {
      headers: headers(A1.jar),
    })
    expect(ownFile.status(), 'dealer A1 can download its own KYC document').toBe(200)
    await expectDenied(
      await request.get(`${BASE_URL}/api/dealer_onboarding/dealer/onboarding/documents/${A1.documentId}/file`, {
        headers: headers(B1.jar),
      }),
      tenantAIds(),
      'dealer B1 (other tenant): download A1 KYC document',
    )
    await expectDenied(
      await request.get(`${BASE_URL}/api/dealer_onboarding/dealer/onboarding/documents/${A1.documentId}/file`, {
        headers: headers(dealers.A2.jar),
      }),
      dealerA1Ids(),
      'dealer A2 (same tenant): download A1 KYC document',
    )

    // Dealer onboarding status shows only the caller's own profile.
    const statusB1 = await getJson(request, '/api/dealer_onboarding/dealer/onboarding/status', B1.jar)
    expect(statusB1.status).toBe(200)
    expect(statusB1.text).toContain(B1.profileId)
    expectNoLeak(statusB1.text, tenantAIds(), 'dealer B1: onboarding status')
    const statusA2 = await getJson(request, '/api/dealer_onboarding/dealer/onboarding/status', dealers.A2.jar)
    expect(statusA2.status).toBe(200)
    expectNoLeak(statusA2.text, { 'dealer A1 profile id': A1.profileId, 'dealer A1 email': A1.email }, 'dealer A2: onboarding status')

    // Each tenant's own admin approves its own dealers.
    for (const [key, jar] of [['A1', adminA], ['A2', adminA], ['B1', adminB]] as const) {
      const approve = await request.post(
        `${BASE_URL}/api/dealer_onboarding/admin/dealers/applications/${dealers[key].profileId}/approve`,
        { headers: headers(jar) },
      )
      expect(approve.status(), `own-tenant admin approves ${key}`).toBe(200)
    }
  })

  test('ISOLATION dealer org: directory, detail, capabilities and staff are tenant- and dealer-scoped', async ({ request }) => {
    const A1 = dealers.A1
    const A2 = dealers.A2
    const B1 = dealers.B1

    for (const dealer of [A1, B1]) {
      const cap = await request.put(`${BASE_URL}/api/dealer_org_rbac/dealer/profile/capabilities`, {
        headers: headers(dealer.jar),
        data: { productTypeCodes: ['mug'], printingMethods: ['sublimation'], maxDailyCapacity: 50, serviceableStates: ['IN-MH'], minOrderQty: 1 },
      })
      expect(cap.status(), `dealer ${dealer.key} sets its own capabilities`).toBe(200)
    }

    // Admin directory.
    const dirB = await getJson(request, '/api/dealer_org_rbac/admin/dealers?pageSize=100', adminB)
    expect(dirB.status).toBe(200)
    expect(dirB.text).toContain(B1.profileId)
    expectNoLeak(dirB.text, tenantAIds(), 'tenant B admin: dealer directory')
    await expectDenied(
      await request.get(`${BASE_URL}/api/dealer_org_rbac/admin/dealers/${A1.profileId}`, { headers: headers(adminB) }),
      tenantAIds(),
      'tenant B admin: read dealer A1',
    )
    await expectDenied(
      await request.put(`${BASE_URL}/api/dealer_org_rbac/admin/dealers/${A1.profileId}/capabilities`, {
        headers: headers(adminB),
        data: { productTypeCodes: ['tshirt'], printingMethods: ['dtg'], maxDailyCapacity: 999, serviceableStates: ['IN-KA'], minOrderQty: 5 },
      }),
      tenantAIds(),
      'tenant B admin: overwrite dealer A1 capabilities',
    )
    const a1Detail = await getJson(request, `/api/dealer_org_rbac/admin/dealers/${A1.profileId}`, adminA)
    expect(a1Detail.status).toBe(200)
    expect(a1Detail.json.capabilities?.maxDailyCapacity, 'A1 capabilities unchanged after the denied cross-tenant PUT').toBe(50)

    // Dealer profile: own only.
    const profileB1 = await getJson(request, '/api/dealer_org_rbac/dealer/profile', B1.jar)
    expect(profileB1.status).toBe(200)
    expect(profileB1.text).toContain(B1.profileId)
    expectNoLeak(profileB1.text, tenantAIds(), 'dealer B1: own profile')
    const profileA2 = await getJson(request, '/api/dealer_org_rbac/dealer/profile', A2.jar)
    expect(profileA2.status).toBe(200)
    expectNoLeak(profileA2.text, { 'dealer A1 profile id': A1.profileId, 'dealer A1 email': A1.email }, 'dealer A2: own profile')

    // Staff: A1 invites a staff member; nobody else can see or deactivate them.
    staffA1Email = `staff-a1-${RUN_ID}@test.local`
    const invite = await request.post(`${BASE_URL}/api/dealer_org_rbac/dealer/staff/invite`, {
      headers: headers(A1.jar),
      data: { email: staffA1Email, name: 'Isolation Staff A1' },
    })
    expect(invite.status()).toBe(201)
    staffA1UserId = (await invite.json()).userId
    expect(staffA1UserId).toBeTruthy()

    const rosterA1 = await getJson(request, '/api/dealer_org_rbac/dealer/staff', A1.jar)
    expect(rosterA1.status).toBe(200)
    expect(rosterA1.text, 'A1 sees its own staff member').toContain(staffA1UserId)

    for (const [other, label] of [[B1, 'dealer B1 (other tenant)'], [A2, 'dealer A2 (same tenant)']] as const) {
      const roster = await getJson(request, '/api/dealer_org_rbac/dealer/staff', other.jar)
      expect(roster.status).toBe(200)
      expectNoLeak(roster.text, { 'A1 staff user id': staffA1UserId, 'A1 staff email': staffA1Email }, `${label}: staff roster`)
      await expectDenied(
        await request.post(`${BASE_URL}/api/dealer_org_rbac/dealer/staff/${staffA1UserId}/deactivate`, { headers: headers(other.jar) }),
        { 'A1 staff email': staffA1Email },
        `${label}: deactivate A1's staff member`,
      )
    }

    // The staff member was not deactivated by the denied attempts: they can still accept the invite and log in.
    const staffJar = await completeInvite(request, staffA1Email, 'StaffA1!Pass123')
    expect(staffJar, "A1's staff member can still log in after the denied cross-dealer deactivations").not.toBeNull()
  })

  test('ISOLATION orders: admin assignment routes and dealer order routes', async ({ request }) => {
    const A1 = dealers.A1
    const A2 = dealers.A2
    const B1 = dealers.B1

    const createOrder = (tenant: ProvisionedTenant, label: string): string =>
      pgCall<{ orderId: string }>('create-paid-order', {
        organizationId: tenant.organizationId,
        tenantId: tenant.tenantId,
        orderNumber: `SO-ISO-${label}-${RUN_ID}`,
        subtotalPaise: 125000,
      }).orderId
    orders.OA1 = createOrder(tenantA, 'OA1')
    orders.OA2 = createOrder(tenantA, 'OA2')
    orders.OB1 = createOrder(tenantB, 'OB1')

    const assign = async (jar: Jar, orderId: string, dealerProfileId: string, label: string): Promise<string> => {
      const res = await request.post(`${BASE_URL}/api/dealer_orders/admin/orders/${orderId}/assignment`, {
        headers: headers(jar, idem(`assign-${label}`)),
        data: { orderId, dealerProfileId, requiredBy: isoDate(7) },
      })
      expect(res.status(), `own-tenant admin assigns ${label}`).toBe(201)
      return (await res.json()).id as string
    }
    assignments.OA1 = await assign(adminA, orders.OA1, A1.profileId, 'OA1->A1')
    assignments.OA2 = await assign(adminA, orders.OA2, A2.profileId, 'OA2->A2')
    assignments.OB1 = await assign(adminB, orders.OB1, B1.profileId, 'OB1->B1')

    // ── Tenant B admin vs tenant A's order OA1 ──
    const currentB = await getJson(request, `/api/dealer_orders/admin/orders/${orders.OA1}/assignment`, adminB)
    expect([200, 403, 404]).toContain(currentB.status)
    if (currentB.status === 200) expect(currentB.json.assignment ?? null, 'tenant B admin sees no assignment for OA1').toBeNull()
    expectNoLeak(currentB.text, tenantAIds(), 'tenant B admin: OA1 current assignment')

    const historyB = await getJson(request, `/api/dealer_orders/admin/orders/${orders.OA1}/assignments`, adminB)
    expect([200, 403, 404]).toContain(historyB.status)
    expectNoLeak(historyB.text, tenantAIds(), 'tenant B admin: OA1 assignment history')
    if (historyB.status === 200) expect(historyB.json.items ?? [], 'tenant B admin sees no history for OA1').toHaveLength(0)

    const dealerOrdersB = await getJson(request, `/api/dealer_orders/admin/dealers/${A1.profileId}/orders`, adminB)
    expect([200, 403, 404]).toContain(dealerOrdersB.status)
    expectNoLeak(dealerOrdersB.text, { ...tenantAIds(), 'dealer A1 profile id': '' }, 'tenant B admin: A1 order list')
    if (dealerOrdersB.status === 200) expect(dealerOrdersB.json.items ?? [], 'tenant B admin sees no orders for A1').toHaveLength(0)

    await expectRejected(
      await request.post(`${BASE_URL}/api/dealer_orders/admin/orders/${orders.OA1}/assignment`, {
        headers: headers(adminB, idem('xassign')),
        data: { orderId: orders.OA1, dealerProfileId: B1.profileId, requiredBy: isoDate(7) },
      }),
      tenantAIds(),
      'tenant B admin: assign tenant A order OA1',
    )
    await expectRejected(
      await request.put(`${BASE_URL}/api/dealer_orders/admin/orders/${orders.OA1}/assignment`, {
        headers: headers(adminB, idem('xreassign')),
        data: { orderId: orders.OA1, dealerProfileId: B1.profileId, requiredBy: isoDate(7), reason: 'cross-tenant' },
      }),
      tenantAIds(),
      'tenant B admin: reassign tenant A order OA1',
    )
    await expectRejected(
      await request.delete(`${BASE_URL}/api/dealer_orders/admin/orders/${orders.OA1}/assignment`, {
        headers: headers(adminB, idem('xcancel')),
        data: { reason: 'cross-tenant cancel attempt' },
      }),
      tenantAIds(),
      'tenant B admin: cancel tenant A order OA1 assignment',
    )

    // OA1's assignment is unchanged, as seen by its own tenant.
    const currentA = await getJson(request, `/api/dealer_orders/admin/orders/${orders.OA1}/assignment`, adminA)
    expect(currentA.status).toBe(200)
    expect(currentA.json.assignment?.id).toBe(assignments.OA1)
    expect(currentA.json.assignment?.dealerProfileId).toBe(A1.profileId)
    expect(currentA.json.assignment?.status).toBe('assigned')

    // ── Dealer routes: other tenant (B1) and same tenant (A2) vs A1's assignment ──
    for (const [other, label, forbidden] of [
      [B1, 'dealer B1 (other tenant)', tenantAIds()],
      [A2, 'dealer A2 (same tenant)', dealerA1Ids()],
    ] as const) {
      await expectDenied(
        await request.get(`${BASE_URL}/api/dealer_orders/dealer/orders/${assignments.OA1}`, { headers: headers(other.jar) }),
        forbidden,
        `${label}: read A1's order detail`,
      )
      const list = await getJson(request, '/api/dealer_orders/dealer/orders?pageSize=100', other.jar)
      expect(list.status).toBe(200)
      expectNoLeak(list.text, forbidden, `${label}: own order list`)
      const dashboard = await getJson(request, '/api/dealer_orders/dealer/dashboard', other.jar)
      expect(dashboard.status).toBe(200)
      expectNoLeak(dashboard.text, forbidden, `${label}: dashboard`)
      await expectRejected(
        await request.post(`${BASE_URL}/api/dealer_orders/dealer/orders/${assignments.OA1}/status`, {
          headers: headers(other.jar),
          data: { status: 'acknowledged' },
        }),
        forbidden,
        `${label}: change A1's order status`,
      )
    }
    // Positive controls: each dealer sees exactly its own assignment.
    const listB1 = await getJson(request, '/api/dealer_orders/dealer/orders?pageSize=100', B1.jar)
    expect(listB1.text).toContain(assignments.OB1)
    const listA2 = await getJson(request, '/api/dealer_orders/dealer/orders?pageSize=100', A2.jar)
    expect(listA2.text).toContain(assignments.OA2)
    const listA1 = await getJson(request, '/api/dealer_orders/dealer/orders?pageSize=100', A1.jar)
    expect(listA1.text).toContain(assignments.OA1)
    expectNoLeak(listA1.text, dealerA2Ids(), 'dealer A1: own order list')
    await expectDenied(
      await request.get(`${BASE_URL}/api/dealer_orders/dealer/orders/${assignments.OA2}`, { headers: headers(A1.jar) }),
      dealerA2Ids(),
      "dealer A1 (same tenant): read A2's order detail",
    )

    // A1's own assignment status is unchanged by the denied transitions.
    const ownDetail = await getJson(request, `/api/dealer_orders/dealer/orders/${assignments.OA1}`, A1.jar)
    expect(ownDetail.status).toBe(200)
    expect(ownDetail.json.assignment?.status, "A1's assignment status unchanged by the denied transitions").toBe('assigned')
  })

  test('ISOLATION commissions: rules, order/dealer commission and dealer earnings', async ({ request }) => {
    const A1 = dealers.A1
    const A2 = dealers.A2
    const B1 = dealers.B1

    // Positive control: A1's commission snapshot exists (written by the assignment subscriber).
    const a1Earnings = await pollUntil(async () => {
      const res = await getJson(request, '/api/commissions/dealer/earnings?pageSize=100', A1.jar)
      return res.status === 200 && res.text.includes(assignments.OA1) ? res : null
    })
    expect(a1Earnings, "dealer A1's earnings include its own assignment").not.toBeNull()
    expectNoLeak(a1Earnings!.text, dealerA2Ids(), 'dealer A1: earnings')

    // Rules.
    const rulesB = await getJson(request, '/api/commissions/admin/commission/rules?activeOnly=false&pageSize=100', adminB)
    expect(rulesB.status).toBe(200)
    expect(rulesB.text).toContain(ruleB)
    expectNoLeak(rulesB.text, tenantAIds(), 'tenant B admin: commission rule list')
    await expectDenied(
      await request.get(`${BASE_URL}/api/commissions/admin/commission/rules/${ruleA}`, { headers: headers(adminB) }),
      tenantAIds(),
      'tenant B admin: read tenant A rule',
    )
    await expectDenied(
      await request.delete(`${BASE_URL}/api/commissions/admin/commission/rules/${ruleA}`, { headers: headers(adminB) }),
      tenantAIds(),
      'tenant B admin: deactivate tenant A rule',
    )
    const ruleAAfter = await getJson(request, `/api/commissions/admin/commission/rules/${ruleA}`, adminA)
    expect(ruleAAfter.status).toBe(200)
    expect(ruleAAfter.json.rule?.effectiveTo ?? null, 'tenant A rule still active after the denied cross-tenant DELETE').toBeNull()

    // Admin commission views.
    await expectDenied(
      await request.get(`${BASE_URL}/api/commissions/admin/orders/${orders.OA1}/commission`, { headers: headers(adminB) }),
      tenantAIds(),
      'tenant B admin: OA1 commission snapshot',
    )
    const ownOrderCommission = await getJson(request, `/api/commissions/admin/orders/${orders.OA1}/commission`, adminA)
    expect(ownOrderCommission.status, 'tenant A admin sees OA1 commission').toBe(200)
    const dealerCommissionB = await getJson(request, `/api/commissions/admin/dealers/${A1.profileId}/commission?pageSize=100`, adminB)
    expect([200, 403, 404]).toContain(dealerCommissionB.status)
    expectNoLeak(dealerCommissionB.text, { ...tenantAIds(), 'dealer A1 profile id': '' }, 'tenant B admin: A1 commission list')
    if (dealerCommissionB.status === 200) expect(dealerCommissionB.json.items ?? []).toHaveLength(0)

    // Dealer earnings: other tenant and same tenant.
    for (const [other, label, forbidden, ownAssignment] of [
      [B1, 'dealer B1 (other tenant)', tenantAIds(), assignments.OB1],
      [A2, 'dealer A2 (same tenant)', dealerA1Ids(), assignments.OA2],
    ] as const) {
      const own = await pollUntil(async () => {
        const res = await getJson(request, '/api/commissions/dealer/earnings?pageSize=100', other.jar)
        return res.status === 200 && res.text.includes(ownAssignment) ? res : null
      })
      expect(own, `${label}: sees its own earnings`).not.toBeNull()
      expectNoLeak(own!.text, forbidden, `${label}: earnings list`)
      await expectDenied(
        await request.get(`${BASE_URL}/api/commissions/dealer/earnings/${assignments.OA1}`, { headers: headers(other.jar) }),
        forbidden,
        `${label}: A1's earnings detail`,
      )
    }
    await expectDenied(
      await request.get(`${BASE_URL}/api/commissions/dealer/earnings/${assignments.OA2}`, { headers: headers(A1.jar) }),
      dealerA2Ids(),
      "dealer A1 (same tenant): A2's earnings detail",
    )
  })

  test('ISOLATION ledger/payouts reads: admin ledger + balance, dealer ledger + balance', async ({ request }) => {
    const A1 = dealers.A1
    const A2 = dealers.A2
    const B1 = dealers.B1

    // Baseline, as seen by A1's own tenant admin (wait for the commission credit to land).
    const baseline = await pollUntil(async () => {
      const res = await getJson(request, `/api/payouts/admin/dealers/${A1.profileId}/ledger/balance`, adminA)
      return res.status === 200 && Number(res.json?.totalEarned) > 0 ? res : null
    })
    expect(baseline, "A1's commission credit is visible to its own tenant admin").not.toBeNull()
    a1BalanceBefore = { pendingAmount: Number(baseline!.json.pendingAmount), totalEarned: Number(baseline!.json.totalEarned) }
    const ledgerA = await getJson(request, `/api/payouts/admin/dealers/${A1.profileId}/ledger?pageSize=100`, adminA)
    expect(ledgerA.status).toBe(200)
    a1LedgerTotalBefore = Number(ledgerA.json.total)
    expect(a1LedgerTotalBefore).toBeGreaterThan(0)

    // Tenant B admin: A1's ledger is empty and its balance reveals nothing.
    const ledgerB = await getJson(request, `/api/payouts/admin/dealers/${A1.profileId}/ledger?pageSize=100`, adminB)
    expect([200, 403, 404]).toContain(ledgerB.status)
    expectNoLeak(ledgerB.text, { ...tenantAIds(), 'dealer A1 profile id': '' }, 'tenant B admin: A1 ledger')
    if (ledgerB.status === 200) expect(ledgerB.json.items ?? [], 'tenant B admin sees no ledger rows for A1').toHaveLength(0)
    const balanceB = await getJson(request, `/api/payouts/admin/dealers/${A1.profileId}/ledger/balance`, adminB)
    expect([200, 403, 404]).toContain(balanceB.status)
    if (balanceB.status === 200) {
      // Current behaviour: 200 with zeros (the query is tenant-filtered). It must never be A1's real balance.
      expect(Number(balanceB.json.totalEarned), "tenant B admin must not see A1's real earnings").toBe(0)
      expect(Number(balanceB.json.pendingAmount)).toBe(0)
    }

    // Dealer ledgers: each dealer's rows are its own.
    for (const [dealer, forbidden] of [
      [B1, tenantAIds()],
      [A2, dealerA1Ids()],
      [A1, dealerA2Ids()],
    ] as const) {
      const ledger = await getJson(request, '/api/payouts/dealer/ledger?pageSize=100', dealer.jar)
      expect(ledger.status).toBe(200)
      for (const item of ledger.json.items ?? []) {
        expect(item.dealerProfileId, `dealer ${dealer.key}: ledger row belongs to the caller`).toBe(dealer.profileId)
      }
      expectNoLeak(ledger.text, forbidden, `dealer ${dealer.key}: ledger`)
      const balance = await getJson(request, '/api/payouts/dealer/ledger/balance', dealer.jar)
      expect(balance.status).toBe(200)
      expect(balance.json.dealerProfileId ?? dealer.profileId).toBe(dealer.profileId)
    }
    const a1OwnBalance = await getJson(request, '/api/payouts/dealer/ledger/balance', A1.jar)
    expect(Number(a1OwnBalance.json.pendingAmount)).toBe(a1BalanceBefore.pendingAmount)

    // Sensitivity check: a real payout by A1's own tenant admin DOES move A1's balance, so the
    // "unchanged" assertions in the next tests are meaningful.
    const ownPayout = await request.post(`${BASE_URL}/api/payouts/admin/dealers/${A1.profileId}/ledger/payout`, {
      headers: headers(adminA, idem('own-payout')),
      data: { dealerProfileId: A1.profileId, amount: 1000, note: `UTR-ISO-${RUN_ID}` },
    })
    expect(ownPayout.status(), 'tenant A admin records a payout for its own dealer').toBe(201)
    const afterOwn = await getJson(request, `/api/payouts/admin/dealers/${A1.profileId}/ledger/balance`, adminA)
    expect(Number(afterOwn.json.pendingAmount)).toBe(a1BalanceBefore.pendingAmount - 1000)
    a1BalanceBefore = { pendingAmount: Number(afterOwn.json.pendingAmount), totalEarned: Number(afterOwn.json.totalEarned) }
    a1LedgerTotalBefore += 1
  })

  test('foreign-dealer writes: tenant B admin attempts writes that reference tenant A dealer A1 (statuses recorded)', async ({ request }) => {
    const A1 = dealers.A1
    orders.OB2 = pgCall<{ orderId: string }>('create-paid-order', {
      organizationId: tenantB.organizationId,
      tenantId: tenantB.tenantId,
      orderNumber: `SO-ISO-OB2-${RUN_ID}`,
      subtotalPaise: 50000,
    }).orderId

    const attempts: Array<{ action: string; run: () => Promise<APIResponse> }> = [
      {
        action: "assign tenant B's own order OB2 to tenant A dealer A1",
        run: () =>
          request.post(`${BASE_URL}/api/dealer_orders/admin/orders/${orders.OB2}/assignment`, {
            headers: headers(adminB, idem('fw-assign')),
            data: { orderId: orders.OB2, dealerProfileId: A1.profileId, requiredBy: isoDate(7) },
          }),
      },
      {
        action: 'create a commission rule scoped to tenant A dealer A1',
        run: () =>
          request.post(`${BASE_URL}/api/commissions/admin/commission/rules`, {
            headers: headers(adminB, idem('fw-rule')),
            data: { dealerProfileId: A1.profileId, rateBps: 9000, effectiveFrom: isoDate(-1) },
          }),
      },
      {
        action: 'record a payout against tenant A dealer A1',
        run: () =>
          request.post(`${BASE_URL}/api/payouts/admin/dealers/${A1.profileId}/ledger/payout`, {
            headers: headers(adminB, idem('fw-payout')),
            data: { dealerProfileId: A1.profileId, amount: 500, note: 'cross-tenant payout attempt' },
          }),
      },
      {
        action: 'create a credit adjustment for tenant A dealer A1',
        run: () =>
          request.post(`${BASE_URL}/api/payouts/admin/dealers/${A1.profileId}/ledger/adjustment`, {
            headers: headers(adminB, idem('fw-adjust')),
            data: { dealerProfileId: A1.profileId, direction: 'credit', amount: 700, note: 'cross-tenant adjustment attempt' },
          }),
      },
    ]
    for (const attempt of attempts) {
      const res = await attempt.run()
      const status = res.status()
      foreignWrites.push({ action: attempt.action, status })
      test.info().annotations.push({ type: 'foreign-dealer-write', description: `${attempt.action}: HTTP ${status}` })
      expect(status < 500, `${attempt.action}: must not 5xx (got ${status})`).toBe(true)
      // Whatever the status, the response must never carry tenant A's data.
      expectNoLeak(await bodyText(res), { 'tenant A id': tenantA.tenantId, 'dealer A1 email': A1.email, 'order OA1 id': orders.OA1 }, attempt.action)
    }
  })

  test('INVARIANT: after every cross-tenant attempt, tenant A data is unchanged and nothing foreign is visible to A1', async ({ request }) => {
    const A1 = dealers.A1

    const balance = await getJson(request, `/api/payouts/admin/dealers/${A1.profileId}/ledger/balance`, adminA)
    expect(balance.status).toBe(200)
    expect(Number(balance.json.pendingAmount), "A1's balance (own tenant view) unchanged by tenant B's writes").toBe(a1BalanceBefore.pendingAmount)
    expect(Number(balance.json.totalEarned)).toBe(a1BalanceBefore.totalEarned)
    const ledger = await getJson(request, `/api/payouts/admin/dealers/${A1.profileId}/ledger?pageSize=100`, adminA)
    expect(Number(ledger.json.total), "A1's ledger (own tenant view) has no rows written by tenant B").toBe(a1LedgerTotalBefore)

    const ownBalance = await getJson(request, '/api/payouts/dealer/ledger/balance', A1.jar)
    expect(Number(ownBalance.json.pendingAmount), "A1's own balance unchanged").toBe(a1BalanceBefore.pendingAmount)
    const ownLedger = await getJson(request, '/api/payouts/dealer/ledger?pageSize=100', A1.jar)
    expect(ownLedger.text).not.toContain('cross-tenant')
    expectNoLeak(ownLedger.text, { 'tenant B id': tenantB.tenantId }, 'dealer A1: own ledger')

    const ownOrders = await getJson(request, '/api/dealer_orders/dealer/orders?pageSize=100', A1.jar)
    expectNoLeak(ownOrders.text, { 'tenant B order OB2': orders.OB2, 'tenant B id': tenantB.tenantId }, 'dealer A1: own order list')
    const ownEarnings = await getJson(request, '/api/commissions/dealer/earnings?pageSize=100', A1.jar)
    expectNoLeak(ownEarnings.text, { 'tenant B order OB2': orders.OB2, 'tenant B id': tenantB.tenantId }, 'dealer A1: own earnings')

    const rulesA = await getJson(request, '/api/commissions/admin/commission/rules?activeOnly=false&pageSize=100', adminA)
    expectNoLeak(rulesA.text, { 'tenant B id': tenantB.tenantId }, 'tenant A admin: rule list')

    // The assignment-notification subscriber is tenant-scoped: A1 must not have been emailed
    // about tenant B's order even if the foreign-dealer assignment above was accepted.
    const a1Mail = capturedEmailsFor(A1.email).join('\n')
    expect(a1Mail.includes(`SO-ISO-OB2-${RUN_ID}`), "dealer A1 received no email about tenant B's order").toBe(false)
    expect(a1Mail.includes(orders.OB2), "dealer A1 received no email referencing tenant B's order id").toBe(false)
  })

  test('KNOWN DEFECT (expected to fail until fixed): writes referencing a foreign-tenant dealerProfileId should be rejected', async () => {
    // Remove `test.fail()` (making these permanent assertions) once every route below checks that
    // `dealerProfileId` belongs to the caller's tenant. Details: tasks/milestone-1/WS-E-migrations-isolation-e2e.md.
    test.fail()
    expect(foreignWrites.length).toBe(4)
    for (const { action, status } of foreignWrites) {
      expect.soft(status >= 400 && status < 500, `${action}: expected a 4xx rejection, got ${status}`).toBe(true)
    }
  })

  test.afterAll(async () => {
    for (const orderId of Object.values(orders)) {
      if (!orderId) continue
      try {
        pgCall('delete-order', { orderId })
      } catch {
        // best-effort cleanup of synthetic sales_orders rows in the disposable database
      }
    }
  })
})
