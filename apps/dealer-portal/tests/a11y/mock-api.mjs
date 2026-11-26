/**
 * Test-only mock of the apps/mercato backend for the dealer-portal accessibility suite.
 *
 * NOT used by the app at runtime and never shipped: it is started by tests/a11y/playwright.config.mjs
 * and the portal is pointed at it via `OM_API_BASE_URL`. It never talks to a real database or the
 * deployed backend. Payload shapes follow tasks/phase-2-ui/API-CONTRACTS.md and the typed
 * contracts in packages/api-client/src/index.ts.
 *
 * Scenario selection: the `auth_token` cookie value is `<persona>` or `<persona>.<variant>`.
 *   persona: owner | staff | pending | underreview | rejected | notdealer | noprofile
 *   variant: loaded (default) | empty | error
 * The `error` variant only fails requests that come from the browser (through the BFF proxy, which
 * forwards the browser's User-Agent). Server-side access gating (src/lib/auth/backend.ts) calls
 * with Node's own fetch UA, so the page still renders and the client-side error state is shown.
 *
 * Run standalone: `node tests/a11y/mock-api.mjs` (port from MOCK_API_PORT, default 3299).
 */
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

const NOW = Date.parse('2026-11-20T09:30:00.000Z')
const iso = (offsetHours = 0) => new Date(NOW + offsetHours * 3_600_000).toISOString()

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const ORG_ID = '00000000-0000-4000-8000-000000000002'
const PROFILE_ID = '00000000-0000-4000-8000-000000000003'

const ROLES = {
  owner: ['dealer:owner'],
  staff: ['dealer:staff'],
  pending: ['dealer:owner'],
  underreview: ['dealer:owner'],
  rejected: ['dealer:owner'],
  noprofile: ['dealer:owner'],
  notdealer: ['admin'],
}

const KYC = {
  owner: 'approved',
  staff: 'approved',
  pending: 'pending_verification',
  underreview: 'under_review',
  rejected: 'rejected',
}

function parseScenario(cookieHeader) {
  const cookies = Object.fromEntries(
    (cookieHeader ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=')
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))]
      }),
  )
  const token = cookies.auth_token
  if (!token) return null
  const [persona, variant = 'loaded'] = token.split('.')
  if (!ROLES[persona]) return null
  return { persona, variant }
}

function documents(persona) {
  if (persona === 'pending') return []
  return [
    {
      id: 'doc-gst-0001',
      dealerProfileId: PROFILE_ID,
      tenantId: TENANT_ID,
      documentType: 'gst_certificate',
      storageKey: 'kyc/doc-gst-0001',
      fileName: 'gst-certificate.pdf',
      fileSizeBytes: 182_344,
      mimeType: 'application/pdf',
      uploadedAt: iso(-72),
    },
    {
      id: 'doc-pan-0001',
      dealerProfileId: PROFILE_ID,
      tenantId: TENANT_ID,
      documentType: 'pan_card',
      storageKey: 'kyc/doc-pan-0001',
      fileName: 'pan-card.jpg',
      fileSizeBytes: 94_120,
      mimeType: 'image/jpeg',
      uploadedAt: iso(-70),
    },
  ]
}

function onboardingStatus(persona) {
  const kycStatus = KYC[persona]
  return {
    id: PROFILE_ID,
    organizationId: ORG_ID,
    tenantId: TENANT_ID,
    businessName: 'Kalpana Prints & Gifts',
    contactEmail: 'owner@kalpana.example',
    phone: '+91 98765 43210',
    businessType: 'proprietorship',
    city: 'Pune',
    state: 'MH',
    pincode: '411001',
    kycStatus,
    rejectionReason: kycStatus === 'rejected' ? 'The GST certificate is unreadable. Please upload a clearer scan.' : null,
    reviewedBy: null,
    reviewedAt: kycStatus === 'approved' || kycStatus === 'rejected' ? iso(-24) : null,
    approvedAt: kycStatus === 'approved' ? iso(-24) : null,
    createdAt: iso(-96),
    updatedAt: iso(-24),
    documents: documents(persona),
  }
}

function orgProfile(variant) {
  const configured = variant !== 'empty'
  return {
    ...onboardingStatus('owner'),
    capabilities: configured
      ? {
          id: 'cap-0001',
          productTypeCodes: ['mugs', 't-shirts', 'photo-frames'],
          printingMethods: ['sublimation', 'dtg'],
          maxDailyCapacity: 120,
          serviceableStates: ['IN-MH', 'IN-KA', 'IN-GJ'],
          minOrderQty: 1,
          updatedAt: iso(-12),
        }
      : {
          productTypeCodes: [],
          printingMethods: [],
          maxDailyCapacity: 0,
          serviceableStates: [],
          minOrderQty: 1,
          updatedAt: null,
        },
  }
}

const ASSIGNMENT_STATUSES = ['assigned', 'acknowledged', 'in_production', 'ready_for_dispatch', 'dispatched', 'cancelled']

function assignment(index) {
  const status = ASSIGNMENT_STATUSES[index % ASSIGNMENT_STATUSES.length]
  const id = `asg-${String(index + 1).padStart(4, '0')}`
  return {
    id,
    orderId: `ord-7f3a9c${String(index + 1).padStart(2, '0')}-1111-4000-8000-000000000000`,
    dealerProfileId: PROFILE_ID,
    tenantId: TENANT_ID,
    organizationId: ORG_ID,
    assignedBy: 'admin-user',
    assignedAt: iso(-48 + index),
    requiredBy: iso(48 + index * 12),
    status,
    statusUpdatedAt: iso(-6),
    statusNote: null,
    cancelledReason: null,
    updatedAt: iso(-6),
  }
}

const ASSIGNMENTS = Array.from({ length: 6 }, (_, i) => assignment(i))

function orderDetail(id) {
  const base = ASSIGNMENTS.find((a) => a.id === id) ?? { ...assignment(0), id }
  return {
    assignment: {
      assignmentId: base.id,
      orderId: base.orderId,
      orderNumber: `GFT-${base.id.slice(-4)}`,
      status: base.status,
      statusNote: base.status === 'in_production' ? 'Waiting on mug blanks from supplier.' : null,
      statusUpdatedAt: base.statusUpdatedAt,
      requiredBy: base.requiredBy,
      assignedAt: base.assignedAt,
      updatedAt: base.updatedAt,
      lines: [
        {
          id: `${base.id}-line-1`,
          productId: 'prod-mug',
          variantId: 'var-mug-white',
          name: 'Personalised ceramic mug (white)',
          quantity: 2,
          giftMessage: 'Happy anniversary, Asha!',
          productionRequirements: { printMethod: 'sublimation', artworkUrl: 'artwork-1234.png', colour_count: 4 },
        },
        {
          id: `${base.id}-line-2`,
          productId: 'prod-frame',
          variantId: null,
          name: 'Engraved photo frame',
          quantity: 1,
          giftMessage: null,
          productionRequirements: null,
        },
      ],
      shipping: { city: 'Mumbai', pincode: '400001' },
    },
  }
}

function earnings(variant) {
  if (variant === 'empty') return { items: [], total: 0, page: 1, pageSize: 20 }
  const items = Array.from({ length: 4 }, (_, i) => ({
    id: `snap-${i + 1}`,
    assignmentId: ASSIGNMENTS[i].id,
    orderId: ASSIGNMENTS[i].orderId,
    dealerProfileId: PROFILE_ID,
    subtotalAmount: 249_900 + i * 10_000,
    currencyCode: 'INR',
    commissionRateBps: 1000,
    commissionAmount: 24_990 + i * 1_000,
    ruleId: 'rule-default',
    snapshottedAt: iso(-40 + i),
  }))
  return { items, total: 24, page: 1, pageSize: 20 }
}

function ledger(variant) {
  if (variant === 'empty') return { items: [], total: 0, page: 1, pageSize: 20 }
  const rows = [
    ['commission_earned', 'credit', 24_990, null],
    ['commission_earned', 'credit', 25_990, null],
    ['payout_disbursed', 'debit', 40_000, 'UTR 1234567890'],
    ['adjustment_credit', 'credit', 5_000, 'Goodwill credit for late assignment'],
    ['adjustment_debit', 'debit', 1_500, 'Damaged item reprint'],
  ]
  const items = rows.map(([entryType, direction, amount, note], i) => ({
    id: `led-${i + 1}`,
    dealerProfileId: PROFILE_ID,
    tenantId: TENANT_ID,
    entryType,
    amount,
    currencyCode: 'INR',
    direction,
    referenceType: entryType === 'commission_earned' ? 'commission_snapshot' : null,
    referenceId: entryType === 'commission_earned' ? `snap-${i + 1}` : null,
    note,
    createdBy: null,
    createdAt: iso(-30 + i),
  }))
  return { items, total: 5, page: 1, pageSize: 20 }
}

function staffRoster(variant) {
  const owner = {
    id: 'user-owner',
    email: 'owner@kalpana.example',
    name: 'Kalpana Deshpande',
    role: 'dealer:owner',
    isActive: true,
    lastLoginAt: iso(-1),
    createdAt: iso(-96),
  }
  if (variant === 'empty') return { items: [owner] }
  return {
    items: [
      owner,
      {
        id: 'user-staff-1',
        email: 'ravi@kalpana.example',
        name: 'Ravi Kumar',
        role: 'dealer:staff',
        isActive: true,
        lastLoginAt: iso(-3),
        createdAt: iso(-50),
      },
      {
        id: 'user-staff-2',
        email: 'meera@kalpana.example',
        name: null,
        role: 'dealer:staff',
        isActive: false,
        lastLoginAt: null,
        createdAt: iso(-20),
      },
    ],
  }
}

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(payload)
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function parseBody(raw, contentType) {
  if (!raw) return {}
  if ((contentType ?? '').includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw))
  }
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

const isBrowser = (req) => /Mozilla/i.test(req.headers['user-agent'] ?? '')

export function createMockApi() {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://mock.local')
    const path = url.pathname.replace(/^\/api\//, '')
    const method = req.method ?? 'GET'
    const raw = method === 'GET' || method === 'HEAD' ? '' : await readBody(req)
    const body = parseBody(raw, req.headers['content-type'])
    const scenario = parseScenario(req.headers.cookie)

    if (path === '__health') return send(res, 200, { ok: true })

    // --- Public / auth routes -------------------------------------------------------------
    if (path === 'auth/login' && method === 'POST') {
      if (String(body.email ?? '').startsWith('wrong')) {
        return send(res, 401, { ok: false, error: 'Invalid email or password' })
      }
      return send(res, 200, { ok: true }, { 'set-cookie': 'auth_token=owner; Path=/; HttpOnly; SameSite=Lax' })
    }
    if (path === 'auth/logout') {
      res.writeHead(302, { location: '/login', 'set-cookie': 'auth_token=; Path=/; Max-Age=0' })
      return res.end()
    }
    if (path === 'auth/session/refresh') return send(res, 401, { error: 'Unauthorized' })
    if (path === 'auth/reset' && method === 'POST') return send(res, 200, { ok: true })
    if (path === 'auth/reset/validate' && method === 'POST') return send(res, 200, { valid: body.token === 'valid-token' })
    if (path === 'auth/reset/confirm' && method === 'POST') return send(res, 200, { ok: true })
    if (path === 'dealer_onboarding/dealer/onboarding/register' && method === 'POST') {
      if (body.contactEmail === 'taken@example.com') {
        return send(res, 409, { error: 'An account with this email already exists.' })
      }
      return send(res, 201, {
        id: PROFILE_ID,
        message: 'Application received. Check your email to set your password and sign in.',
      })
    }

    // --- Everything below needs a session ------------------------------------------------
    if (!scenario) return send(res, 401, { error: 'Unauthorized' })
    const { persona, variant } = scenario

    if (path === 'auth/profile') {
      return send(res, 200, { email: 'owner@kalpana.example', name: 'Kalpana Deshpande', roles: ROLES[persona] })
    }

    if (variant === 'error' && isBrowser(req)) {
      return send(res, 500, { error: 'The server hit an unexpected error. Please try again.' })
    }

    if (path === 'dealer_onboarding/dealer/onboarding/status') {
      if (persona === 'notdealer') return send(res, 403, { error: 'Forbidden' })
      if (persona === 'noprofile') return send(res, 404, { error: 'Not found' })
      return send(res, 200, onboardingStatus(persona))
    }
    if (path === 'dealer_onboarding/dealer/onboarding/resubmit' && method === 'POST') return send(res, 200, { ok: true })
    if (path === 'dealer_onboarding/dealer/onboarding/documents' && method === 'POST') {
      return send(res, 201, { id: 'doc-new-0001', documentType: 'address_proof', fileName: 'upload.pdf' })
    }
    const fileMatch = path.match(/^dealer_onboarding\/dealer\/onboarding\/documents\/([^/]+)\/file$/)
    if (fileMatch) {
      res.writeHead(200, { 'content-type': 'application/pdf' })
      return res.end('%PDF-1.4\n%mock\n')
    }

    if (path === 'dealer_org_rbac/dealer/profile') return send(res, 200, orgProfile(variant))
    if (path === 'dealer_org_rbac/dealer/profile/capabilities' && method === 'PUT') {
      if (Number(body.maxDailyCapacity) === 999) {
        return send(res, 409, { error: 'Capabilities were changed by someone else.' })
      }
      return send(res, 200, { ...orgProfile('loaded').capabilities, ...body, updatedAt: new Date().toISOString() })
    }
    if (path === 'dealer_org_rbac/dealer/staff') return send(res, 200, staffRoster(variant))
    if (path === 'dealer_org_rbac/dealer/staff/invite' && method === 'POST') {
      if (body.email === 'taken@example.com') return send(res, 400, { error: 'Email already in use' })
      return send(res, 201, { userId: 'user-new', email: body.email })
    }
    const deactivate = path.match(/^dealer_org_rbac\/dealer\/staff\/([^/]+)\/deactivate$/)
    if (deactivate) return send(res, 200, { userId: deactivate[1], deactivated: true })

    if (path === 'dealer_orders/dealer/dashboard') {
      return send(res, 200, {
        pendingAcknowledgment: variant === 'empty' ? 0 : 3,
        inProduction: variant === 'empty' ? 0 : 5,
        dispatchedThisWeek: variant === 'empty' ? 0 : 12,
        weekStartsAt: '2026-11-16T18:30:00.000Z',
        timezone: 'Asia/Kolkata',
      })
    }
    if (path === 'dealer_orders/dealer/orders') {
      const page = Number(url.searchParams.get('page') ?? '1')
      const pageSize = Number(url.searchParams.get('pageSize') ?? '25')
      const status = url.searchParams.get('status')
      let items = variant === 'empty' ? [] : ASSIGNMENTS
      if (status) items = items.filter((a) => a.status === status)
      const total = variant === 'empty' ? 0 : status ? items.length : 60
      return send(res, 200, { items: items.slice(0, pageSize), total, page, pageSize })
    }
    const statusMatch = path.match(/^dealer_orders\/dealer\/orders\/([^/]+)\/status$/)
    if (statusMatch && method === 'POST') {
      if (statusMatch[1] === 'asg-0002') return send(res, 409, { error: 'Conflict' })
      return send(res, 200, { ok: true })
    }
    const detailMatch = path.match(/^dealer_orders\/dealer\/orders\/([^/]+)$/)
    if (detailMatch) {
      if (detailMatch[1] === 'missing') return send(res, 404, { error: 'Not found' })
      return send(res, 200, orderDetail(detailMatch[1]))
    }

    if (path === 'commissions/dealer/earnings') return send(res, 200, earnings(variant))
    if (path === 'payouts/dealer/ledger') return send(res, 200, ledger(variant))
    if (path === 'payouts/dealer/ledger/balance') {
      return send(res, 200, {
        pendingAmount: variant === 'empty' ? 0 : 1_448_000,
        totalEarned: variant === 'empty' ? 0 : 5_123_400,
        currencyCode: 'INR',
      })
    }

    return send(res, 404, { error: `Mock API has no route for ${method} /api/${path}` })
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.MOCK_API_PORT ?? 3299)
  createMockApi().listen(port, '127.0.0.1', () => {
    console.log(`[mock-api] listening on http://127.0.0.1:${port}`)
  })
}
