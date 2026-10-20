/**
 * Data layer for the dealer-facing order detail / production-status screen (`/orders/[id]`,
 * TASK-10). Per this task's exact owned-paths list, `src/lib/features/orders/detail.ts` is the
 * ONE file this task may add under `lib/features/orders/` — mirroring TASK-09's `list.ts`
 * convention, every query-builder, fetcher, mutation and display helper for this feature lives
 * here; React/state-management code lives under `src/components/orders/detail/` instead (this
 * task's other owned path).
 *
 * `[id]` here is the ASSIGNMENT id, never the sales order id — see
 * tasks/phase-2-ui/API-CONTRACTS.md's "assignment-ID vs order-ID" resolution and
 * CONTRACT-HANDOFF.md's route table (`/orders/[id]` -> `GET .../dealer/orders/{assignmentId}`).
 *
 * Deliberately does NOT import TASK-09's `list.ts`, even though both files describe the same
 * `GET .../dealer/orders/{assignmentId}` response shape — each task owns its own file and the
 * two run concurrently in this checkout; duplicating the (small) type here keeps this task's
 * surface independently buildable/testable, matching the repo-wide "redeclare, don't
 * cross-import across an ownership boundary" convention (e.g. `dealer_org_rbac/lib/constants.ts`
 * redeclaring role names rather than importing them from `dealer_onboarding`).
 */
import { ApiError, request } from '@gift/api-client'
import type { AssignmentStatus } from '@gift/api-client'

// ── Safe dealer order detail — the FEAT-010-scoped projection only ──────────────────────────────
//
// Exactly the shape documented in tasks/phase-2-ui/API-CONTRACTS.md's "Safe dealer order detail"
// section and verified directly against `dealer_orders/commands/assignments.ts`'s
// `buildDealerOrderDetail`/`lib/orderDetails.ts`:
//
//   { assignmentId, orderId, orderNumber, status, statusNote, statusUpdatedAt, requiredBy,
//     assignedAt, updatedAt, lines: [{ id, productId, variantId, name, quantity, giftMessage,
//     productionRequirements }], shipping: { city, pincode } }
//
// There is NO customer name/phone/full address/email anywhere in this shape — the backend's own
// projection excludes `dealerProfileId`/`tenantId`/`organizationId`/`assignedBy`/`cancelledReason`
// and all customer PII/payment data. Every type below lists only fields that are actually present
// on the real response; nothing here widens the shape with a guessed PII field, and every
// component this task builds reads fields by name off these types rather than ever spreading/
// rendering the raw response object (which would silently start rendering a PII field if the
// backend ever added one without this task first reviewing it).

export interface OrderDetailLine {
  id: string
  productId: string | null
  variantId: string | null
  name: string | null
  quantity: number
  giftMessage: string | null
  /** Catalog customization payload + free-text comment, merged. Rendered opaquely. */
  productionRequirements: Record<string, unknown> | null
}

export interface OrderDetailShipping {
  city: string | null
  pincode: string | null
}

export interface DealerOrderDetail {
  assignmentId: string
  orderId: string
  orderNumber: string | null
  status: AssignmentStatus
  statusNote: string | null
  statusUpdatedAt: string | null
  requiredBy: string | null
  assignedAt: string | null
  updatedAt: string | null
  lines: OrderDetailLine[]
  shipping: OrderDetailShipping
}

/** `GET /api/dealer_orders/dealer/orders/{assignmentId}` — note: ASSIGNMENT id, never the order id. */
export async function fetchOrderDetail(assignmentId: string): Promise<DealerOrderDetail> {
  const { assignment } = await request<{ assignment: DealerOrderDetail }>(
    `dealer_orders/dealer/orders/${encodeURIComponent(assignmentId)}`,
  )
  return assignment
}

// ── Dealer-writable status transitions — mirrored from the real backend constants ───────────────
//
// Verbatim copy of `apps/mercato/src/modules/dealer_orders/lib/constants.ts`'s
// `DEALER_STATUS_TRANSITIONS` (read directly from source for this task, not guessed from the
// spec files, which `API-CONTRACTS.md` warns are not implementation-accurate). The backend is the
// sole enforcement point — every value here exists only so this UI can offer the ONE real forward
// action and never construct a request for a transition the backend would reject; a change to the
// backend's graph must be mirrored here by hand, same as every other cross-app constant mirror in
// this codebase (e.g. `orders/list.ts`'s `ORDER_STATUS_FILTERS`, `dealer_org_rbac`'s role names).
export const DEALER_STATUS_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  assigned: ['acknowledged'],
  acknowledged: ['in_production'],
  in_production: ['ready_for_dispatch'],
  ready_for_dispatch: ['dispatched'],
  dispatched: [],
  cancelled: [],
}

/** The single next forward status a dealer may move to, or `null` if the status is terminal. */
export function nextStatusFor(status: AssignmentStatus): AssignmentStatus | null {
  const allowed = DEALER_STATUS_TRANSITIONS[status] ?? []
  return allowed[0] ?? null
}

/** `true` for `dispatched`/`cancelled` — no dealer action is ever possible from here. */
export function isTerminalStatus(status: AssignmentStatus): boolean {
  return (DEALER_STATUS_TRANSITIONS[status] ?? []).length === 0
}

/** `cancelled` specifically — the assignment was cancelled or superseded by a reassignment. */
export function isCancelledStatus(status: AssignmentStatus): boolean {
  return status === 'cancelled'
}

export interface UpdateStatusInput {
  status: AssignmentStatus
  /** Optional, <=500 chars — mirrors `updateAssignmentStatusSchema.note`. Overwrites, not appends. */
  note?: string
  /**
   * Optimistic-concurrency version (repo convention): the `updatedAt` last read from
   * `fetchOrderDetail`. Sending it opts into a real 409 on a stale write (see
   * `dealer_orders/commands/assignments.ts`'s `executeUpdateStatus`); omitting it keeps
   * last-write-wins. This task always sends it — see `StatusUpdateForm`.
   */
  updatedAt?: string
}

/**
 * `POST /api/dealer_orders/dealer/orders/{assignmentId}/status` — the only mutation this task
 * owns. Never sends a status this UI didn't itself compute from `nextStatusFor` (see
 * `StatusUpdateForm`), but the backend remains the real gate: an unexpected 400 (invalid
 * transition / cancelled assignment), 404 (not found), or 409 (stale version) must still be
 * handled by the caller, not assumed impossible because the client "already checked".
 */
export async function updateOrderStatus(assignmentId: string, input: UpdateStatusInput): Promise<{ ok: true }> {
  const body: Record<string, unknown> = { status: input.status }
  const trimmedNote = input.note?.trim()
  if (trimmedNote) body.note = trimmedNote
  if (input.updatedAt) body.updatedAt = input.updatedAt
  return request<{ ok: true }>(`dealer_orders/dealer/orders/${encodeURIComponent(assignmentId)}/status`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Classifies a mutation/fetch failure into the distinct UI states TASK-10's acceptance criteria
 * call out by name, so a component never has to re-derive this from a raw status code inline.
 * `conflict` (409) and `invalid_transition` (400) are kept separate on purpose: a 409 means
 * "someone else changed this since you loaded it — reload and retry"; a 400 means "the
 * transition itself is not allowed from the current status" — the two need different copy and
 * different recovery actions (refetch vs. just dismissing the error), and conflating them would
 * make the 409 case look like a confusing restatement of a rule that was never broken.
 */
export type OrderDetailErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'invalid_transition'
  | 'unknown'

export function classifyOrderDetailError(error: unknown): OrderDetailErrorKind {
  if (!(error instanceof ApiError)) return 'unknown'
  if (error.isUnauthorized) return 'unauthorized'
  if (error.isForbidden) return 'forbidden'
  if (error.status === 404) return 'not_found'
  if (error.status === 409) return 'conflict'
  if (error.status === 400) return 'invalid_transition'
  return 'unknown'
}

/**
 * "engravingText" -> "Engraving text". Production requirements are an opaque catalog
 * customization payload (plus a possible free-text `note`); this only prettifies the key for
 * display, it never interprets the value.
 */
function prettifyRequirementKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export interface ProductionRequirementEntry {
  label: string
  value: string
}

/**
 * Flattens the opaque `productionRequirements` record into label/value pairs for display.
 * Non-primitive values are JSON-stringified rather than dropped, so nothing is silently hidden;
 * `null`/`undefined` values are skipped (nothing meaningful to show).
 */
export function formatProductionRequirements(requirements: Record<string, unknown> | null): ProductionRequirementEntry[] {
  if (!requirements) return []
  return Object.entries(requirements)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => ({
      label: prettifyRequirementKey(key),
      value: typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : JSON.stringify(value),
    }))
}

/** A dealer-meaningful reference for the order — never a bare UUID. Mirrors `orders/list.ts`'s helper. */
export function orderReferenceLabel(orderNumber: string | null): string {
  return orderNumber ?? 'Order reference unavailable'
}
