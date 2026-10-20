import { describe, expect, it, jest } from '@jest/globals'
import { submitRecordPayout, submitCreateAdjustment } from '../ledgerActions'

type RecordPayoutPost = (body: { amount: number; note: string }) => Promise<{ id: string }>
type CreateAdjustmentPost = (body: { direction: 'credit' | 'debit'; amount: number; note: string }) => Promise<{ id: string }>

function unusedRecordPayoutPost() {
  return jest.fn<RecordPayoutPost>()
}

function unusedCreateAdjustmentPost() {
  return jest.fn<CreateAdjustmentPost>()
}

describe('submitRecordPayout', () => {
  it('rejects a zero amount client-side without calling post', async () => {
    const post = unusedRecordPayoutPost()
    const result = await submitRecordPayout({ amountRaw: '0', note: 'UTR123', post })
    expect(result).toEqual({ ok: false, error: { code: 'invalid_amount', message: 'invalid_amount' } })
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects a negative amount client-side without calling post', async () => {
    const post = unusedRecordPayoutPost()
    const result = await submitRecordPayout({ amountRaw: '-50', note: 'UTR123', post })
    expect(result.ok).toBe(false)
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects a fractional-paise (more than 2 decimals) amount client-side without calling post', async () => {
    const post = unusedRecordPayoutPost()
    const result = await submitRecordPayout({ amountRaw: '10.555', note: 'UTR123', post })
    expect(result.ok).toBe(false)
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects a missing reference client-side without calling post', async () => {
    const post = unusedRecordPayoutPost()
    const result = await submitRecordPayout({ amountRaw: '100', note: '   ', post })
    expect(result).toEqual({ ok: false, error: { code: 'missing_note', message: 'missing_note' } })
    expect(post).not.toHaveBeenCalled()
  })

  it('converts the rupee input to integer paise and trims the note before calling post', async () => {
    const post = jest.fn<(body: { amount: number; note: string }) => Promise<{ id: string }>>()
      .mockResolvedValue({ id: 'entry-1' })
    const result = await submitRecordPayout({ amountRaw: '1250.50', note: '  UTR123456  ', post })
    expect(post).toHaveBeenCalledWith({ amount: 125050, note: 'UTR123456' })
    expect(result).toEqual({ ok: true, id: 'entry-1' })
  })

  it('failure-recovery: a thrown server error becomes a structured failure, not an unhandled rejection', async () => {
    const post = jest.fn<(body: { amount: number; note: string }) => Promise<{ id: string }>>()
      .mockRejectedValue(new Error('Payout amount exceeds dealer balance'))
    const result = await submitRecordPayout({ amountRaw: '500', note: 'UTR999', post })
    expect(result).toEqual({
      ok: false,
      error: { code: 'request_failed', message: 'Payout amount exceeds dealer balance' },
    })
  })

  it('failure-recovery: a failed submission does not retry on its own — post is called exactly once', async () => {
    const post = jest.fn<(body: { amount: number; note: string }) => Promise<{ id: string }>>()
      .mockRejectedValue(new Error('network error'))
    await submitRecordPayout({ amountRaw: '500', note: 'UTR999', post })
    expect(post).toHaveBeenCalledTimes(1)
  })
})

describe('submitCreateAdjustment', () => {
  it('rejects a zero amount client-side', async () => {
    const post = unusedCreateAdjustmentPost()
    const result = await submitCreateAdjustment({ direction: 'credit', amountRaw: '0', note: 'reason', post })
    expect(result.ok).toBe(false)
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects a missing reason client-side', async () => {
    const post = unusedCreateAdjustmentPost()
    const result = await submitCreateAdjustment({ direction: 'debit', amountRaw: '100', note: '', post })
    expect(result).toEqual({ ok: false, error: { code: 'missing_note', message: 'missing_note' } })
    expect(post).not.toHaveBeenCalled()
  })

  it('submits the chosen direction, integer paise, and trimmed reason', async () => {
    const post = jest.fn<(body: { direction: 'credit' | 'debit'; amount: number; note: string }) => Promise<{ id: string }>>()
      .mockResolvedValue({ id: 'adj-1' })
    const result = await submitCreateAdjustment({ direction: 'debit', amountRaw: '75', note: ' Reversed commission ', post })
    expect(post).toHaveBeenCalledWith({ direction: 'debit', amount: 7500, note: 'Reversed commission' })
    expect(result).toEqual({ ok: true, id: 'adj-1' })
  })

  it('failure-recovery: surfaces the server error message on failure', async () => {
    const post = jest.fn<(body: { direction: 'credit' | 'debit'; amount: number; note: string }) => Promise<{ id: string }>>()
      .mockRejectedValue(new Error('Note is required for adjustment entries'))
    const result = await submitCreateAdjustment({ direction: 'credit', amountRaw: '10', note: 'x', post })
    expect(result).toEqual({
      ok: false,
      error: { code: 'request_failed', message: 'Note is required for adjustment entries' },
    })
  })
})
