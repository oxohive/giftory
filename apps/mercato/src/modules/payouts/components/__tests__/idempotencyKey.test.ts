import { describe, expect, it, jest } from '@jest/globals'
import { createIdempotencyKeyHolder } from '../idempotencyKey'
import { classifyLedgerMutationFailure, submitRecordPayout } from '../ledgerActions'

describe('createIdempotencyKeyHolder — one key per dialog session', () => {
  it('mints lazily and reuses the same key for every resubmit', () => {
    const mint = jest.fn<() => string>().mockReturnValueOnce('key-1-aaaaaaaaaaaaaaaa').mockReturnValueOnce('key-2-bbbbbbbbbbbbbbbb')
    const holder = createIdempotencyKeyHolder(mint)
    expect(holder.peek()).toBeNull()
    expect(mint).not.toHaveBeenCalled()
    expect(holder.current()).toBe('key-1-aaaaaaaaaaaaaaaa')
    expect(holder.current()).toBe('key-1-aaaaaaaaaaaaaaaa')
    expect(mint).toHaveBeenCalledTimes(1)
  })

  it('mints a fresh key after release (dialog closed / operation finished)', () => {
    const mint = jest.fn<() => string>().mockReturnValueOnce('key-1-aaaaaaaaaaaaaaaa').mockReturnValueOnce('key-2-bbbbbbbbbbbbbbbb')
    const holder = createIdempotencyKeyHolder(mint)
    holder.current()
    holder.release()
    expect(holder.peek()).toBeNull()
    expect(holder.current()).toBe('key-2-bbbbbbbbbbbbbbbb')
  })

  it('default keys satisfy the server key format (16-128 chars of [A-Za-z0-9_-:.])', () => {
    const key = createIdempotencyKeyHolder().current()
    expect(key).toMatch(/^[A-Za-z0-9_\-:.]{16,128}$/)
  })
})

describe('classifyLedgerMutationFailure', () => {
  function httpError(message: string, fields: Record<string, unknown>) {
    return Object.assign(new Error(message), fields)
  }

  it('maps 422 insufficient_balance and keeps the available amount', () => {
    const err = httpError('Payout amount exceeds the dealer balance', { status: 422, code: 'insufficient_balance', availableAmount: 1234 })
    expect(classifyLedgerMutationFailure(err)).toEqual({
      code: 'insufficient_balance',
      message: 'Payout amount exceeds the dealer balance',
      availableAmount: 1234,
    })
  })

  it('tolerates a missing/invalid available amount', () => {
    const err = httpError('x', { code: 'insufficient_balance', availableAmount: '12' })
    expect(classifyLedgerMutationFailure(err)).toMatchObject({ code: 'insufficient_balance', availableAmount: null })
  })

  it('maps 409 idempotency_key_reused to idempotency_conflict', () => {
    expect(classifyLedgerMutationFailure(httpError('reused', { status: 409, code: 'idempotency_key_reused' }))).toEqual({
      code: 'idempotency_conflict',
      message: 'reused',
    })
  })

  it('falls back to request_failed for anything else', () => {
    expect(classifyLedgerMutationFailure(new Error('network down'))).toEqual({ code: 'request_failed', message: 'network down' })
    expect(classifyLedgerMutationFailure(undefined)).toEqual({ code: 'request_failed', message: '' })
  })

  it('submitRecordPayout surfaces insufficient_balance from the server', async () => {
    const post = jest.fn(async () => {
      throw httpError('too much', { status: 422, code: 'insufficient_balance', availableAmount: 500 })
    })
    const result = await submitRecordPayout({ amountRaw: '10', note: 'UTR1', post })
    expect(result).toEqual({ ok: false, error: { code: 'insufficient_balance', message: 'too much', availableAmount: 500 } })
  })
})
