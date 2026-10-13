/**
 * Assignment status lifecycle (linear progression; any non-cancelled status
 * can be moved to `cancelled` by an admin via the cancel endpoint).
 *
 * assigned → acknowledged → in_production → ready_for_dispatch → dispatched
 *      └──────────────────────────────────────────────────────→ cancelled
 */
export const ASSIGNMENT_STATUSES = [
  'assigned',
  'acknowledged',
  'in_production',
  'ready_for_dispatch',
  'dispatched',
  'cancelled',
] as const

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number]

/** Dealer-writable transitions: each key → allowed next values from the dealer portal. */
export const DEALER_STATUS_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  assigned: ['acknowledged'],
  acknowledged: ['in_production'],
  in_production: ['ready_for_dispatch'],
  ready_for_dispatch: ['dispatched'],
  dispatched: [],
  cancelled: [],
}

/** Statuses that represent a live (non-terminal) assignment. */
export const ACTIVE_STATUSES: AssignmentStatus[] = [
  'assigned',
  'acknowledged',
  'in_production',
  'ready_for_dispatch',
  'dispatched',
]

export const DEALER_ORDER_ASSIGNMENT_ENTITY_ID = 'dealer_orders:dealer_order_assignment' as const
export const DEALER_ORDER_ASSIGNMENT_RESOURCE_KIND = 'dealer_orders.dealer_order_assignment' as const

export const DEALER_ORDER_ASSIGN_COMMAND = 'dealer_orders.assignments.assign' as const
export const DEALER_ORDER_REASSIGN_COMMAND = 'dealer_orders.assignments.reassign' as const
export const DEALER_ORDER_CANCEL_COMMAND = 'dealer_orders.assignments.cancel' as const
export const DEALER_ORDER_UPDATE_STATUS_COMMAND = 'dealer_orders.assignments.update_status' as const

/**
 * Dealer role names, created by `dealer_onboarding`'s setup. Redeclared
 * locally per the module-isolation convention (see
 * `dealer_org_rbac/lib/constants.ts` for the existing precedent) — do not
 * import role names across module boundaries.
 */
export const DEALER_OWNER_ROLE = 'dealer:owner' as const
export const DEALER_STAFF_ROLE = 'dealer:staff' as const
