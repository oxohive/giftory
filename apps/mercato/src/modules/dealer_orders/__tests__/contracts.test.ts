import { describe, expect, it } from '@jest/globals'
import {
  assignOrderSchema,
  reassignOrderSchema,
  cancelAssignmentSchema,
  updateAssignmentStatusSchema,
  assignmentListQuerySchema,
} from '../data/validators'
import { ASSIGNMENT_STATUSES, DEALER_STATUS_TRANSITIONS, ACTIVE_STATUSES } from '../lib/constants'

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
