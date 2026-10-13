/**
 * Allowlist for the BFF proxy (src/app/api/om/[...path]/route.ts). Every entry is a
 * dealer-facing or shared-auth route documented in tasks/phase-2-ui/API-CONTRACTS.md.
 * Admin/backend routes are never proxied here — admin screens live in apps/mercato directly,
 * so staff credentials never pass through this app.
 */
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface Rule {
  pattern: RegExp
  methods: Method[]
}

export const ALLOWED: Rule[] = [
  // Shared core auth (@open-mercato/core's `auth` module) — the same endpoints admin/staff use;
  // dealer users (dealer:owner / dealer:staff) are ordinary rows in the same `User` table.
  { pattern: /^auth\/login$/, methods: ['POST'] },
  { pattern: /^auth\/logout$/, methods: ['POST'] },
  { pattern: /^auth\/session\/refresh$/, methods: ['POST'] },
  { pattern: /^auth\/profile$/, methods: ['GET'] },

  // dealer_onboarding (FEAT-008).
  { pattern: /^dealer_onboarding\/dealer\/onboarding\/register$/, methods: ['POST'] },
  { pattern: /^dealer_onboarding\/dealer\/onboarding\/status$/, methods: ['GET'] },
  { pattern: /^dealer_onboarding\/dealer\/onboarding\/documents$/, methods: ['POST'] },
  { pattern: /^dealer_onboarding\/dealer\/onboarding\/documents\/[^/]+\/file$/, methods: ['GET'] },
  { pattern: /^dealer_onboarding\/dealer\/onboarding\/resubmit$/, methods: ['POST'] },

  // dealer_org_rbac (FEAT-009).
  { pattern: /^dealer_org_rbac\/dealer\/profile$/, methods: ['GET'] },
  { pattern: /^dealer_org_rbac\/dealer\/profile\/capabilities$/, methods: ['PUT'] },
  { pattern: /^dealer_org_rbac\/dealer\/staff$/, methods: ['GET'] },
  { pattern: /^dealer_org_rbac\/dealer\/staff\/invite$/, methods: ['POST'] },
  { pattern: /^dealer_org_rbac\/dealer\/staff\/[^/]+\/deactivate$/, methods: ['POST'] },

  // dealer_orders (FEAT-011). Dealer-side {id} is the ASSIGNMENT id, not the order id.
  { pattern: /^dealer_orders\/dealer\/dashboard$/, methods: ['GET'] },
  { pattern: /^dealer_orders\/dealer\/orders$/, methods: ['GET'] },
  { pattern: /^dealer_orders\/dealer\/orders\/[^/]+$/, methods: ['GET'] },
  { pattern: /^dealer_orders\/dealer\/orders\/[^/]+\/status$/, methods: ['POST'] },

  // commissions (FEAT-012).
  { pattern: /^commissions\/dealer\/earnings$/, methods: ['GET'] },
  { pattern: /^commissions\/dealer\/earnings\/[^/]+$/, methods: ['GET'] },

  // payouts (FEAT-013).
  { pattern: /^payouts\/dealer\/ledger$/, methods: ['GET'] },
  { pattern: /^payouts\/dealer\/ledger\/balance$/, methods: ['GET'] },
]

/**
 * Paths that must never trigger a transparent `auth_token` refresh: the refresh call itself
 * (would recurse), login/logout (no session yet, or ending one on purpose), and the public
 * registration route (`requireAuth:false`, no session expected).
 */
export const NO_REFRESH = new Set<string>([
  'auth/login',
  'auth/logout',
  'auth/session/refresh',
  'dealer_onboarding/dealer/onboarding/register',
])

export function isAllowed(path: string, method: string): boolean {
  if (path.includes('..') || path.includes('//')) return false
  return ALLOWED.some((rule) => rule.pattern.test(path) && rule.methods.includes(method as Method))
}
