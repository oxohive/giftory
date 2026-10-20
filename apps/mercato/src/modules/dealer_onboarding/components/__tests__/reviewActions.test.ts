import { describe, expect, it, jest } from '@jest/globals'
import {
  submitApproveApplication,
  submitRejectApplication,
  isReviewConflictStatus,
  canApproveFromStatus,
  canRejectFromStatus,
} from '../reviewActions'

function httpError(status: number, message = 'failed'): Error & { status: number } {
  const err = new Error(message) as Error & { status: number }
  err.status = status
  return err
}

describe('isReviewConflictStatus', () => {
  it('treats the REAL contract status (400, badRequest from executeApprove/executeReject) as a conflict', () => {
    expect(isReviewConflictStatus(400)).toBe(true)
  })

  it('also treats a literal 409 as a conflict, defensively, in case the backend ever adds one', () => {
    expect(isReviewConflictStatus(409)).toBe(true)
  })

  it('does not treat other statuses as a conflict', () => {
    expect(isReviewConflictStatus(401)).toBe(false)
    expect(isReviewConflictStatus(403)).toBe(false)
    expect(isReviewConflictStatus(404)).toBe(false)
    expect(isReviewConflictStatus(500)).toBe(false)
    expect(isReviewConflictStatus(undefined)).toBe(false)
  })
})

describe('submitApproveApplication', () => {
  it('resolves ok:true when the post succeeds', async () => {
    const post = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const result = await submitApproveApplication({ post })
    expect(result).toEqual({ ok: true })
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('classifies a 400/409 failure as a conflict (someone already decided this application)', async () => {
    const post = jest.fn<() => Promise<void>>().mockRejectedValue(httpError(400, 'This dealer is already approved'))
    const result = await submitApproveApplication({ post })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('conflict')
      expect(result.error.message).toBe('This dealer is already approved')
    }
  })

  it('classifies a 401/403 failure as forbidden, distinct from a conflict', async () => {
    const post = jest.fn<() => Promise<void>>().mockRejectedValue(httpError(403, 'Forbidden'))
    const result = await submitApproveApplication({ post })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('forbidden')
  })

  it('classifies anything else (500, network failure) as a generic request failure', async () => {
    const post = jest.fn<() => Promise<void>>().mockRejectedValue(httpError(500, 'Internal error'))
    const result = await submitApproveApplication({ post })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('request_failed')
  })
})

describe('submitRejectApplication', () => {
  it('rejects client-side, before sending any request, when the reason is empty or whitespace-only', async () => {
    const post = jest.fn<(body: { reason: string }) => Promise<void>>().mockResolvedValue(undefined)
    const result = await submitRejectApplication({ reason: '   ', post })
    expect(result).toEqual({ ok: false, error: { code: 'missing_reason', message: 'missing_reason' } })
    expect(post).not.toHaveBeenCalled()
  })

  it('trims the reason before sending it', async () => {
    const post = jest.fn<(body: { reason: string }) => Promise<void>>().mockResolvedValue(undefined)
    const result = await submitRejectApplication({ reason: '  Docs incomplete  ', post })
    expect(result).toEqual({ ok: true })
    expect(post).toHaveBeenCalledWith({ reason: 'Docs incomplete' })
  })

  it('classifies a 400/409 failure (e.g. double-reject, or reject-after-approve) as a conflict', async () => {
    const post = jest.fn<(body: { reason: string }) => Promise<void>>().mockRejectedValue(
      httpError(400, 'This dealer is already rejected'),
    )
    const result = await submitRejectApplication({ reason: 'Docs incomplete', post })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('conflict')
  })
})

describe('canApproveFromStatus / canRejectFromStatus — mirrors executeApprove/executeReject exactly', () => {
  it('approve is only possible from under_review', () => {
    expect(canApproveFromStatus('under_review')).toBe(true)
    expect(canApproveFromStatus('pending_verification')).toBe(false)
    expect(canApproveFromStatus('approved')).toBe(false)
    expect(canApproveFromStatus('rejected')).toBe(false)
  })

  it('reject is possible from pending_verification or under_review, never approved or already-rejected', () => {
    expect(canRejectFromStatus('pending_verification')).toBe(true)
    expect(canRejectFromStatus('under_review')).toBe(true)
    expect(canRejectFromStatus('approved')).toBe(false)
    expect(canRejectFromStatus('rejected')).toBe(false)
  })
})
