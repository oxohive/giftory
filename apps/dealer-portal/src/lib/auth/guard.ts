import 'server-only'
import { redirect } from 'next/navigation'
import type { DealerRole } from '@/components/layout/nav-items'
import { decideAccess } from './access'
import { getDealerAccess } from './session'

export interface ResolvedAccess {
  role: DealerRole
}

async function enforce(requireRole: DealerRole[] | undefined, returnTo: string | undefined): Promise<ResolvedAccess> {
  const state = await getDealerAccess()
  const decision = decideAccess(state, { requireRole, returnTo })
  if (!decision.allow || !decision.role) {
    redirect(decision.redirectTo ?? '/login')
  }
  return { role: decision.role }
}

/**
 * The server-side gate every real portal page/layout should call before rendering anything —
 * "server authorization is required regardless of hidden navigation" (README's shared
 * acceptance rule). Redirects an unauthenticated, wrong-account-type, or not-yet-approved caller
 * before any dealer data is fetched; resolves to `{ role }` only for an approved dealer
 * (owner or staff).
 *
 * This is the gate tasks/phase-2-ui/CONTRACT-HANDOFF.md calls out as "TASK-04 owns this gate;
 * TASK-08 (dashboard) consumes it rather than re-implementing it" — e.g.
 *
 *   export default async function DashboardPage() {
 *     const { role } = await requireApprovedDealer()
 *     // ...fetch dealer_orders/commissions/payouts aggregates, mount <PortalShell role={role}>
 *   }
 *
 * `returnTo`, when given, should be the page's own path (e.g. `/orders/${id}`) so a signed-out
 * visit to a deep link returns there after login — it is sanitized again before use (see
 * return-to.ts), so passing an already-trusted literal path is always safe.
 */
export async function requireApprovedDealer(options: { returnTo?: string } = {}): Promise<ResolvedAccess> {
  return enforce(undefined, options.returnTo)
}

/**
 * Like requireApprovedDealer, but additionally restricted to the given role(s) — e.g. the
 * owner-only `/staff` and `/earnings` pages (per CONTRACT-HANDOFF's "Navigation entries" freeze).
 * A staff caller is redirected to `/forbidden`, not merely shown a disabled nav link.
 */
export async function requireRole(roles: DealerRole[], options: { returnTo?: string } = {}): Promise<ResolvedAccess> {
  return enforce(roles, options.returnTo)
}
