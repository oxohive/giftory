import { describe, expect, it, jest } from '@jest/globals'
import {
  submitAssignOrder,
  submitReassignOrder,
  submitCancelAssignment,
  isFutureDateOnly,
  formatDateOnly,
  type AssignOrderBody,
  type ReassignOrderBody,
} from '../assignmentActions'

function httpError(status: number, message: string, code?: string): Error & { status: number; code?: string } {
  const err = new Error(message) as Error & { status: number; code?: string }
  err.status = status
  if (code) err.code = code
  return err
}

type AssignPost = (body: AssignOrderBody) => Promise<{ id: string }>
type ReassignPost = (body: ReassignOrderBody) => Promise<{ id: string }>
type CancelPost = (body: { reason: string }) => Promise<void>

describe('submitAssignOrder', () => {
  it('rejects client-side when no dealer is selected, without calling post', async () => {
    const post = jest.fn<AssignPost>()
    const result = await submitAssignOrder({ dealerProfileId: '', requiredBy: '2099-01-01', post })
    expect(result).toEqual({ ok: false, error: { code: 'validation', message: 'dealer_required' } })
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects client-side when no deadline is selected, without calling post', async () => {
    const post = jest.fn<AssignPost>()
    const result = await submitAssignOrder({ dealerProfileId: 'dealer-1', requiredBy: '', post })
    expect(result).toEqual({ ok: false, error: { code: 'validation', message: 'required_by_required' } })
    expect(post).not.toHaveBeenCalled()
  })

  it('returns the created assignment id on success', async () => {
    const post = jest.fn<AssignPost>().mockResolvedValue({ id: 'assignment-1' })
    const result = await submitAssignOrder({ dealerProfileId: 'dealer-1', requiredBy: '2099-01-01', post })
    expect(result).toEqual({ ok: true, data: { id: 'assignment-1' } })
    expect(post).toHaveBeenCalledWith({ dealerProfileId: 'dealer-1', requiredBy: '2099-01-01' })
  })

  it('classifies an unpaid-order 400 as order_not_paid (the real assertOrderIsPaid contract)', async () => {
    const post = jest.fn<AssignPost>().mockRejectedValue(httpError(400, 'Order must be in paid status before it can be assigned'))
    const result = await submitAssignOrder({ dealerProfileId: 'dealer-1', requiredBy: '2099-01-01', post })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toEqual({ code: 'order_not_paid', message: 'Order must be in paid status before it can be assigned' })
  })

  it('classifies an existing-active-assignment 409 as conflict', async () => {
    const post = jest.fn<AssignPost>().mockRejectedValue(httpError(409, 'Order already has an active assignment; use reassign to change the dealer'))
    const result = await submitAssignOrder({ dealerProfileId: 'dealer-1', requiredBy: '2099-01-01', post })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('conflict')
  })

  it('classifies 403 as forbidden', async () => {
    const post = jest.fn<AssignPost>().mockRejectedValue(httpError(403, 'Forbidden'))
    const result = await submitAssignOrder({ dealerProfileId: 'dealer-1', requiredBy: '2099-01-01', post })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('forbidden')
  })

  it('classifies a missing Idempotency-Key 400 distinctly from order_not_paid', async () => {
    const post = jest.fn<AssignPost>().mockRejectedValue(httpError(400, 'Idempotency-Key header is required for this operation', 'idempotency_key_required'))
    const result = await submitAssignOrder({ dealerProfileId: 'dealer-1', requiredBy: '2099-01-01', post })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('idempotency_key_required')
  })

  it('falls back to request_failed for an unrecognized status', async () => {
    const post = jest.fn<AssignPost>().mockRejectedValue(httpError(500, 'Something went wrong'))
    const result = await submitAssignOrder({ dealerProfileId: 'dealer-1', requiredBy: '2099-01-01', post })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('request_failed')
  })
})

describe('submitReassignOrder', () => {
  it('omits reason from the body when not provided', async () => {
    const post = jest.fn<ReassignPost>().mockResolvedValue({ id: 'assignment-2' })
    await submitReassignOrder({ dealerProfileId: 'dealer-2', requiredBy: '2099-02-02', post })
    expect(post).toHaveBeenCalledWith({ dealerProfileId: 'dealer-2', requiredBy: '2099-02-02' })
  })

  it('trims and includes a provided reason', async () => {
    const post = jest.fn<ReassignPost>().mockResolvedValue({ id: 'assignment-2' })
    await submitReassignOrder({ dealerProfileId: 'dealer-2', requiredBy: '2099-02-02', reason: '  capacity issue  ', post })
    expect(post).toHaveBeenCalledWith({ dealerProfileId: 'dealer-2', requiredBy: '2099-02-02', reason: 'capacity issue' })
  })

  it('classifies a missing-active-assignment 404 as not_found (reassign has no 409 path)', async () => {
    const post = jest.fn<ReassignPost>().mockRejectedValue(httpError(404, 'Assignment not found'))
    const result = await submitReassignOrder({ dealerProfileId: 'dealer-2', requiredBy: '2099-02-02', post })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not_found')
  })

  it('classifies an unpaid-order 400 as order_not_paid', async () => {
    const post = jest.fn<ReassignPost>().mockRejectedValue(httpError(400, 'Order must be in paid status before it can be assigned'))
    const result = await submitReassignOrder({ dealerProfileId: 'dealer-2', requiredBy: '2099-02-02', post })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('order_not_paid')
  })
})

describe('submitCancelAssignment', () => {
  it('rejects client-side on an empty reason, without calling post', async () => {
    const post = jest.fn<CancelPost>()
    const result = await submitCancelAssignment({ reason: '   ', post })
    expect(result).toEqual({ ok: false, error: { code: 'validation', message: 'reason_required' } })
    expect(post).not.toHaveBeenCalled()
  })

  it('trims the reason before sending it', async () => {
    const post = jest.fn<CancelPost>().mockResolvedValue(undefined)
    await submitCancelAssignment({ reason: '  no longer needed  ', post })
    expect(post).toHaveBeenCalledWith({ reason: 'no longer needed' })
  })

  it('classifies a missing-active-assignment 404 as not_found', async () => {
    const post = jest.fn<CancelPost>().mockRejectedValue(httpError(404, 'Assignment not found'))
    const result = await submitCancelAssignment({ reason: 'reason', post })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not_found')
  })

  it('classifies 403 as forbidden', async () => {
    const post = jest.fn<CancelPost>().mockRejectedValue(httpError(403, 'Forbidden'))
    const result = await submitCancelAssignment({ reason: 'reason', post })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('forbidden')
  })
})

describe('isFutureDateOnly', () => {
  it('accepts a far-future date', () => {
    expect(isFutureDateOnly('2099-12-31')).toBe(true)
  })

  it('rejects a past date', () => {
    expect(isFutureDateOnly('2000-01-01')).toBe(false)
  })

  it('rejects a malformed value', () => {
    expect(isFutureDateOnly('not-a-date')).toBe(false)
    expect(isFutureDateOnly('')).toBe(false)
  })
})

describe('formatDateOnly', () => {
  it('formats using local year/month/day without a UTC shift', () => {
    const date = new Date(2026, 0, 5) // Jan 5, 2026, local time, month is 0-indexed
    expect(formatDateOnly(date)).toBe('2026-01-05')
  })
})
