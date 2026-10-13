/**
 * Thin client for the dealer portal's `/api/om/*` BFF proxy (apps/dealer-portal/src/app/api/om).
 * Response/error shapes below are verified against tasks/phase-2-ui/API-CONTRACTS.md's
 * "Standard response shapes" table — this is the one place that should encode them, so feature
 * tasks consume `ApiError`/`request` rather than re-parsing error bodies themselves.
 */

export interface ValidationDetail {
  path: string | number | (string | number)[]
  message: string
}

interface ErrorBody {
  error?: string
  code?: string
  details?: ValidationDetail[]
  requiredFeatures?: string[]
}

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly details?: ValidationDetail[]
  readonly requiredFeatures?: string[]

  constructor(status: number, message: string, options: { code?: string; details?: ValidationDetail[]; requiredFeatures?: string[] } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = options.code
    this.details = options.details
    this.requiredFeatures = options.requiredFeatures
  }

  /** 401 — the session cookie is missing/expired. Show SessionExpired, not a generic error. */
  get isUnauthorized(): boolean {
    return this.status === 401
  }

  /** 403 — authenticated but missing the required feature grant. Show PermissionDenied. */
  get isForbidden(): boolean {
    return this.status === 403
  }

  /** 422 — validation failure; `details` carries the per-field messages. */
  get isValidation(): boolean {
    return this.status === 422
  }

  /** 429 — rate limited. */
  get isRateLimited(): boolean {
    return this.status === 429
  }

  /** Network failure / the proxy couldn't reach the backend (never a real HTTP status). */
  get isNetworkError(): boolean {
    return this.status === 0
  }
}

function messageFor(status: number, body: ErrorBody): string {
  if (status === 401) return 'Your session has expired. Please sign in again.'
  if (status === 403) return 'You do not have permission to perform this action.'
  if (status === 429) return 'Too many attempts. Please wait before trying again.'
  if (typeof body.error === 'string' && body.error) return body.error
  return 'The request failed. Please try again.'
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages?: number
}

export function buildQuery(query?: Record<string, string | number | boolean | null | undefined>): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/** Call the dealer-portal's same-origin BFF proxy. `path` excludes the leading `/api/om/`. */
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch('/api/om/' + path, {
      ...options,
      cache: 'no-store',
      headers: {
        ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new ApiError(0, 'Network error. Please check your connection and try again.')
  }
  const text = await response.text()
  const body = (text ? safeJsonParse(text) : {}) as ErrorBody
  if (!response.ok) {
    throw new ApiError(response.status, messageFor(response.status, body), {
      code: body.code,
      details: body.details,
      requiredFeatures: body.requiredFeatures,
    })
  }
  return (text ? safeJsonParse(text) : {}) as T
}

// --- Typed contracts (tasks/phase-2-ui/API-CONTRACTS.md). Extend, don't replace, per module. ---

export type KycStatus = 'pending_verification' | 'under_review' | 'approved' | 'rejected'
export type BusinessType = 'proprietorship' | 'partnership' | 'pvt_ltd' | 'llp'
export type DocumentType = 'gst_certificate' | 'pan_card' | 'address_proof'
export type AssignmentStatus = 'assigned' | 'acknowledged' | 'in_production' | 'ready_for_dispatch' | 'dispatched' | 'cancelled'
export type PrintingMethod = 'sublimation' | 'dtg' | 'laser_engraving' | 'uv_print' | 'offset'
export type LedgerEntryType = 'commission_earned' | 'payout_disbursed' | 'adjustment_credit' | 'adjustment_debit'
export type LedgerDirection = 'credit' | 'debit'

export interface DealerDocument {
  id: string
  dealerProfileId: string
  tenantId: string
  documentType: DocumentType
  storageKey: string
  fileName: string
  fileSizeBytes: number
  mimeType: string
  uploadedAt: string
}

/** GET .../dealer/onboarding/status — dealer_onboarding (FEAT-008). */
export interface DealerProfile {
  id: string
  organizationId: string
  tenantId: string
  businessName: string
  contactEmail: string
  phone: string
  gstin?: string
  pan?: string
  businessType: BusinessType
  city: string
  state: string
  pincode: string
  kycStatus: KycStatus
  rejectionReason: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
  documents?: DealerDocument[]
}

export interface DealerCapabilities {
  productTypeCodes: string[]
  printingMethods: PrintingMethod[]
  maxDailyCapacity: number
  serviceableStates: string[]
  minOrderQty: number
  updatedAt?: string
}

/**
 * GET .../dealer_org_rbac/dealer/profile — API-CONTRACTS.md documents this as "profile +
 * capabilities" without itemizing every identity field. `capabilities` is verified; treat any
 * other field as provisional until TASK-06 confirms it against the route source.
 */
export interface DealerOrgProfile {
  id: string
  organizationId: string
  businessName: string
  capabilities: DealerCapabilities
  [key: string]: unknown
}

/** dealer_orders (FEAT-011). Dealer-side `{id}` is the ASSIGNMENT id, not the order id. */
export interface Assignment {
  id: string
  orderId: string
  dealerProfileId: string
  tenantId: string
  organizationId: string
  assignedBy: string
  assignedAt: string
  requiredBy: string | null
  status: AssignmentStatus
  statusUpdatedAt: string
  statusNote: string | null
  cancelledReason: string | null
  updatedAt: string
}

/** commissions (FEAT-012). `rateBps`/`commissionRateBps` are basis points (100 = 1%). */
export interface CommissionRule {
  id: string
  dealerProfileId: string | null
  productTypeCode: string | null
  rateBps: number
  effectiveFrom: string
  effectiveTo: string | null
  createdBy: string
  createdAt: string
}

/** commissions (FEAT-012). Amounts are integer paise — pass straight to formatMoney. */
export interface CommissionSnapshot {
  id: string
  assignmentId: string
  orderId: string
  dealerProfileId: string
  subtotalAmount: number
  currencyCode: string
  commissionRateBps: number
  commissionAmount: number
  ruleId: string | null
  snapshottedAt: string
}

/** payouts (FEAT-013). Append-only ledger row; amounts are integer paise. */
export interface LedgerEntry {
  id: string
  dealerProfileId: string
  tenantId: string
  entryType: LedgerEntryType
  amount: number
  currencyCode: string
  direction: LedgerDirection
  referenceType: string | null
  referenceId: string | null
  note: string | null
  createdBy: string | null
  createdAt: string
}

/**
 * payouts (FEAT-013). Aggregate only — there is no per-row running balance.
 * `pendingAmount` can legitimately go negative (no payout-sufficiency guard server-side yet;
 * see API-CONTRACTS.md Gap 5/6). Render it as a valid state, not a bug to hide.
 */
export interface LedgerBalance {
  pendingAmount: number
  totalEarned: number
}

/** GET /api/auth/profile (shared core auth) — the only "who am I" endpoint; no tenant/org here. */
export interface AuthProfile {
  email: string
  name: string | null
  roles: string[]
}
