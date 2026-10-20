import type { EntityManager } from '@mikro-orm/postgresql'
import { resolveOwnDealerProfileId } from '../commands/shared'
import { startOfIstWeek } from './dateWindows'

export type DealerDashboardAggregates = {
  pendingAcknowledgment: number
  inProduction: number
  dispatchedThisWeek: number
  weekStartsAt: string
  timezone: 'Asia/Kolkata'
}

/**
 * Computes the dealer dashboard's order-status counts as a single SQL
 * aggregate scoped to the caller's OWN dealer profile — never by summing or
 * filtering a paginated page of assignments, which would silently undercount
 * once there is more than one page. See the route doc comment for the full
 * rationale on the IST week boundary.
 */
export async function computeDealerDashboard(
  em: EntityManager,
  organizationId: string,
  tenantId: string,
  now: Date = new Date(),
): Promise<DealerDashboardAggregates> {
  const dealerProfileId = await resolveOwnDealerProfileId(em, organizationId, tenantId)
  const weekStartsAt = startOfIstWeek(now)

  const rows = await em.getConnection().execute(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'assigned') AS pending_acknowledgment,
       COUNT(*) FILTER (WHERE status = 'in_production') AS in_production,
       COUNT(*) FILTER (WHERE status = 'dispatched' AND status_updated_at >= ?) AS dispatched_this_week
     FROM dealer_order_assignments
     WHERE tenant_id = ? AND dealer_profile_id = ? AND deleted_at IS NULL`,
    [weekStartsAt.toISOString(), tenantId, dealerProfileId],
  )
  const row = (rows[0] ?? {}) as Record<string, unknown>

  return {
    pendingAcknowledgment: Number(row.pending_acknowledgment ?? 0),
    inProduction: Number(row.in_production ?? 0),
    dispatchedThisWeek: Number(row.dispatched_this_week ?? 0),
    weekStartsAt: weekStartsAt.toISOString(),
    timezone: 'Asia/Kolkata',
  }
}
