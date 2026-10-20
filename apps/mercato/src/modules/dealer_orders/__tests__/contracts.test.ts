import { describe, expect, it } from '@jest/globals'
import {
  assignOrderSchema,
  reassignOrderSchema,
  cancelAssignmentSchema,
  updateAssignmentStatusSchema,
  assignmentListQuerySchema,
} from '../data/validators'
import { ASSIGNMENT_STATUSES, DEALER_STATUS_TRANSITIONS, ACTIVE_STATUSES } from '../lib/constants'
import { serializeAssignment } from '../commands/assignments'
import type { DealerOrderAssignment } from '../data/entities'

const VALID_UUID = 'a1b2c3d4-e5f6-4789-8abc-def012345678'
const FUTURE_DATE = '2099-12-31'
const PAST_DATE = '2020-01-01'

describe('assignOrderSchema', () => {
  it('accepts a valid assignment payload', () => {
    const result = assignOrderSchema.parse({
      orderId: VALID_UUID,
      dealerProfileId: VALID_UUID,
      requiredBy: FUTURE_DATE,
    })
    expect(result.orderId).toBe(VALID_UUID)
    expect(result.requiredBy).toBe(FUTURE_DATE)
  })

  it('strips tenantId and organizationId from payload', () => {
    const result = assignOrderSchema.parse({
      orderId: VALID_UUID,
      dealerProfileId: VALID_UUID,
      requiredBy: FUTURE_DATE,
      tenantId: VALID_UUID,
      organizationId: VALID_UUID,
    }) as Record<string, unknown>
    expect(result.tenantId).toBeUndefined()
    expect(result.organizationId).toBeUndefined()
  })

  it('rejects a past requiredBy date', () => {
    const result = assignOrderSchema.safeParse({
      orderId: VALID_UUID,
      dealerProfileId: VALID_UUID,
      requiredBy: PAST_DATE,
    })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid date format', () => {
    const result = assignOrderSchema.safeParse({
      orderId: VALID_UUID,
      dealerProfileId: VALID_UUID,
      requiredBy: '31/12/2099',
    })
    expect(result.success).toBe(false)
  })
})

describe('cancelAssignmentSchema', () => {
  it('requires a non-empty reason', () => {
    expect(cancelAssignmentSchema.safeParse({ orderId: VALID_UUID, reason: '' }).success).toBe(false)
    expect(cancelAssignmentSchema.safeParse({ orderId: VALID_UUID, reason: 'Dealer unavailable' }).success).toBe(true)
  })
})

describe('updateAssignmentStatusSchema', () => {
  it('rejects cancelled as a dealer-writable status', () => {
    const result = updateAssignmentStatusSchema.safeParse({
      assignmentId: VALID_UUID,
      status: 'cancelled',
    })
    expect(result.success).toBe(false)
  })

  it('rejects assigned as a dealer-writable status', () => {
    expect(updateAssignmentStatusSchema.safeParse({ assignmentId: VALID_UUID, status: 'assigned' }).success).toBe(false)
  })

  it('accepts a valid dealer-writable status', () => {
    expect(updateAssignmentStatusSchema.safeParse({ assignmentId: VALID_UUID, status: 'acknowledged' }).success).toBe(true)
    expect(updateAssignmentStatusSchema.safeParse({ assignmentId: VALID_UUID, status: 'in_production' }).success).toBe(true)
    expect(updateAssignmentStatusSchema.safeParse({ assignmentId: VALID_UUID, status: 'ready_for_dispatch' }).success).toBe(true)
    expect(updateAssignmentStatusSchema.safeParse({ assignmentId: VALID_UUID, status: 'dispatched' }).success).toBe(true)
  })
})

describe('DEALER_STATUS_TRANSITIONS', () => {
  it('only allows forward transitions', () => {
    expect(DEALER_STATUS_TRANSITIONS.assigned).toEqual(['acknowledged'])
    expect(DEALER_STATUS_TRANSITIONS.acknowledged).toEqual(['in_production'])
    expect(DEALER_STATUS_TRANSITIONS.dispatched).toEqual([])
    expect(DEALER_STATUS_TRANSITIONS.cancelled).toEqual([])
  })
})

describe('ACTIVE_STATUSES', () => {
  it('excludes cancelled', () => {
    expect(ACTIVE_STATUSES).not.toContain('cancelled')
  })

  it('includes all non-terminal statuses', () => {
    const nonTerminal = ASSIGNMENT_STATUSES.filter((s) => s !== 'cancelled')
    expect(ACTIVE_STATUSES).toEqual(expect.arrayContaining(nonTerminal))
  })
})

describe('assignmentListQuerySchema', () => {
  it('applies default pagination', () => {
    const result = assignmentListQuerySchema.parse({})
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(25)
  })

  it('coerces string numbers', () => {
    const result = assignmentListQuerySchema.parse({ page: '2', pageSize: '10' })
    expect(result.page).toBe(2)
    expect(result.pageSize).toBe(10)
  })

  it('rejects pageSize above 100', () => {
    expect(assignmentListQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false)
  })
})

// ── Additional coverage ───────────────────────────────────────────────────────

const ASSIGN_DATE = new Date('2026-10-11T10:00:00.000Z')

function makeAssignment(overrides: Partial<DealerOrderAssignment> = {}): DealerOrderAssignment {
  return {
    id: 'assign-uuid-1',
    orderId: 'order-uuid-1',
    dealerProfileId: 'dealer-uuid-1',
    tenantId: 'tenant-uuid-1',
    organizationId: 'org-uuid-1',
    assignedBy: 'user-uuid-1',
    assignedAt: ASSIGN_DATE,
    requiredBy: '2099-12-31',
    status: 'assigned',
    statusUpdatedAt: ASSIGN_DATE,
    statusNote: null,
    cancelledReason: null,
    createdAt: ASSIGN_DATE,
    updatedAt: ASSIGN_DATE,
    deletedAt: null,
    ...overrides,
  } as DealerOrderAssignment
}

describe('reassignOrderSchema', () => {
  it('accepts a valid payload without reason', () => {
    const result = reassignOrderSchema.parse({
      orderId: VALID_UUID,
      dealerProfileId: VALID_UUID,
      requiredBy: FUTURE_DATE,
    })
    expect(result.orderId).toBe(VALID_UUID)
    expect(result.dealerProfileId).toBe(VALID_UUID)
    expect(result.requiredBy).toBe(FUTURE_DATE)
    expect(result.reason).toBeUndefined()
  })

  it('accepts a valid payload with an optional reason', () => {
    const result = reassignOrderSchema.parse({
      orderId: VALID_UUID,
      dealerProfileId: VALID_UUID,
      requiredBy: FUTURE_DATE,
      reason: 'Dealer is unavailable',
    })
    expect(result.reason).toBe('Dealer is unavailable')
  })

  it('strips tenantId and organizationId from payload', () => {
    const result = reassignOrderSchema.parse({
      orderId: VALID_UUID,
      dealerProfileId: VALID_UUID,
      requiredBy: FUTURE_DATE,
      tenantId: VALID_UUID,
      organizationId: VALID_UUID,
    }) as Record<string, unknown>
    expect(result.tenantId).toBeUndefined()
    expect(result.organizationId).toBeUndefined()
  })

  it('rejects a past requiredBy date', () => {
    expect(
      reassignOrderSchema.safeParse({
        orderId: VALID_UUID,
        dealerProfileId: VALID_UUID,
        requiredBy: PAST_DATE,
      }).success,
    ).toBe(false)
  })

  it('rejects an invalid date format', () => {
    expect(
      reassignOrderSchema.safeParse({
        orderId: VALID_UUID,
        dealerProfileId: VALID_UUID,
        requiredBy: '31/12/2099',
      }).success,
    ).toBe(false)
  })
})

describe('updateAssignmentStatusSchema — note field', () => {
  it('accepts a string note alongside a valid status', () => {
    const result = updateAssignmentStatusSchema.safeParse({
      assignmentId: VALID_UUID,
      status: 'acknowledged',
      note: 'Order confirmed with supplier',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.note).toBe('Order confirmed with supplier')
  })

  it('accepts null for note', () => {
    const result = updateAssignmentStatusSchema.safeParse({
      assignmentId: VALID_UUID,
      status: 'acknowledged',
      note: null,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.note).toBeNull()
  })

  it('accepts an absent note field', () => {
    const result = updateAssignmentStatusSchema.safeParse({
      assignmentId: VALID_UUID,
      status: 'in_production',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.note).toBeUndefined()
  })
})

describe('DEALER_STATUS_TRANSITIONS — complete coverage', () => {
  it('in_production only allows ready_for_dispatch', () => {
    expect(DEALER_STATUS_TRANSITIONS.in_production).toEqual(['ready_for_dispatch'])
  })

  it('ready_for_dispatch only allows dispatched', () => {
    expect(DEALER_STATUS_TRANSITIONS.ready_for_dispatch).toEqual(['dispatched'])
  })

  it('dispatched is terminal — no allowed transitions', () => {
    expect(DEALER_STATUS_TRANSITIONS.dispatched).toEqual([])
  })

  it('cancelled is terminal — no allowed transitions', () => {
    expect(DEALER_STATUS_TRANSITIONS.cancelled).toEqual([])
  })

  it('every status key is present in the map', () => {
    for (const s of ASSIGNMENT_STATUSES) {
      expect(Object.prototype.hasOwnProperty.call(DEALER_STATUS_TRANSITIONS, s)).toBe(true)
    }
  })
})

describe('serializeAssignment', () => {
  it('serializes all scalar fields correctly', () => {
    const assignment = makeAssignment()
    const result = serializeAssignment(assignment)

    expect(result.id).toBe('assign-uuid-1')
    expect(result.orderId).toBe('order-uuid-1')
    expect(result.dealerProfileId).toBe('dealer-uuid-1')
    expect(result.tenantId).toBe('tenant-uuid-1')
    expect(result.organizationId).toBe('org-uuid-1')
    expect(result.assignedBy).toBe('user-uuid-1')
    expect(result.requiredBy).toBe('2099-12-31')
    expect(result.status).toBe('assigned')
  })

  it('converts Date fields to ISO strings', () => {
    const assignment = makeAssignment({
      assignedAt: ASSIGN_DATE,
      statusUpdatedAt: ASSIGN_DATE,
      updatedAt: ASSIGN_DATE,
    })
    const result = serializeAssignment(assignment)
    expect(result.assignedAt).toBe('2026-10-11T10:00:00.000Z')
    expect(result.statusUpdatedAt).toBe('2026-10-11T10:00:00.000Z')
    expect(result.updatedAt).toBe('2026-10-11T10:00:00.000Z')
  })

  it('returns null for nullable fields when they are null', () => {
    const assignment = makeAssignment({ statusNote: null, cancelledReason: null })
    const result = serializeAssignment(assignment)
    expect(result.statusNote).toBeNull()
    expect(result.cancelledReason).toBeNull()
  })

  it('includes statusNote and cancelledReason when set', () => {
    const assignment = makeAssignment({
      status: 'cancelled',
      statusNote: 'Production started',
      cancelledReason: 'Dealer unavailable',
    })
    const result = serializeAssignment(assignment)
    expect(result.statusNote).toBe('Production started')
    expect(result.cancelledReason).toBe('Dealer unavailable')
    expect(result.status).toBe('cancelled')
  })

  it('returns null for date fields when the value is absent', () => {
    const assignment = makeAssignment({
      assignedAt: undefined as unknown as Date,
      updatedAt: undefined as unknown as Date,
    })
    const result = serializeAssignment(assignment)
    expect(result.assignedAt).toBeNull()
    expect(result.updatedAt).toBeNull()
  })
})

describe('assignmentListQuerySchema — status filter', () => {
  it('accepts each valid assignment status', () => {
    for (const status of ASSIGNMENT_STATUSES) {
      expect(assignmentListQuerySchema.safeParse({ status }).success).toBe(true)
    }
  })

  it('rejects an unknown status value', () => {
    expect(assignmentListQuerySchema.safeParse({ status: 'pending' }).success).toBe(false)
    expect(assignmentListQuerySchema.safeParse({ status: 'completed' }).success).toBe(false)
  })

  it('allows an omitted status field (optional)', () => {
    const result = assignmentListQuerySchema.parse({})
    expect(result.status).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Gap 1 fix — dealer_orders.dealer_access must be granted to BOTH dealer
// roles (FEAT-009: staff can view/update assigned orders, unlike the
// commissions/payouts dealer_access grants which are owner-only). This is
// the exact cell from CONTRACT-HANDOFF.md's permission matrix
// ("dealer_orders.dealer_access" → owner ✓, staff ✓ after TASK-02).
// ---------------------------------------------------------------------------

describe('setup.defaultRoleFeatures — Gap 1 fix (dealer_access grants)', () => {
  it('grants dealer_orders.dealer_access to both dealer:owner and dealer:staff', async () => {
    const { setup } = await import('../setup')
    const { DEALER_OWNER_ROLE, DEALER_STAFF_ROLE } = await import('../lib/constants')
    expect(setup.defaultRoleFeatures?.[DEALER_OWNER_ROLE]).toContain('dealer_orders.dealer_access')
    expect(setup.defaultRoleFeatures?.[DEALER_STAFF_ROLE]).toContain('dealer_orders.dealer_access')
  })
})
