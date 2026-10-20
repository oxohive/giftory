import { describe, expect, it } from '@jest/globals'
import { formatPaise, formatBps, previewCommissionAmount, computeCommissionAmount, MIN_RATE_BPS, MAX_RATE_BPS } from '../money'

describe('formatPaise', () => {
  it('formats a typical INR amount with two decimals and thousands separators', () => {
    expect(formatPaise(1234500)).toBe('₹12,345.00')
  })

  it('formats zero', () => {
    expect(formatPaise(0)).toBe('₹0.00')
  })

  it('formats a negative amount (e.g. a negative pending balance elsewhere) with a leading minus', () => {
    expect(formatPaise(-150)).toBe('-₹1.50')
  })

  it('formats a non-INR currency code with a space-separated prefix', () => {
    expect(formatPaise(100000, 'USD')).toBe('USD 1,000.00')
  })

  it('truncates a non-integer input rather than rounding (defensive — amounts are always integers in practice)', () => {
    expect(formatPaise(1234.9)).toBe('₹12.34')
  })
})

describe('formatBps', () => {
  it('formats a round percentage', () => {
    expect(formatBps(250)).toBe('250 bps (2.50%)')
  })

  it('formats a sub-1% rate', () => {
    expect(formatBps(1)).toBe('1 bps (0.01%)')
  })

  it('formats the maximum rate (100%)', () => {
    expect(formatBps(10000)).toBe('10000 bps (100.00%)')
  })

  it('formats zero', () => {
    expect(formatBps(0)).toBe('0 bps (0.00%)')
  })
})

// previewCommissionAmount calls the REAL backend `computeCommissionAmount`
// (re-exported, not re-implemented) — these assertions double as proof
// that the UI's bps->currency preview can never drift from what
// `POST /api/commissions/admin/commission/rules`'s snapshot math produces.
describe('previewCommissionAmount', () => {
  it('matches computeCommissionAmount exactly for a mid-range rate', () => {
    expect(previewCommissionAmount(250, 1000000)).toBe(computeCommissionAmount(1000000, 250))
    expect(previewCommissionAmount(250, 1000000)).toBe(25000) // 2.5% of ₹10,000 = ₹250.00
  })

  it('uses the example ₹10,000 subtotal by default', () => {
    expect(previewCommissionAmount(1000)).toBe(computeCommissionAmount(1000000, 1000))
  })

  it('returns null for a non-integer rate (still mid-edit)', () => {
    expect(previewCommissionAmount(18.5)).toBeNull()
  })

  it('returns null for a negative rate', () => {
    expect(previewCommissionAmount(-1)).toBeNull()
  })

  it('returns null for a rate above MAX_RATE_BPS — never calls the throwing backend function out of range', () => {
    expect(previewCommissionAmount(MAX_RATE_BPS + 1)).toBeNull()
  })

  it('accepts the rate at MIN_RATE_BPS and MAX_RATE_BPS (the real backend bounds, not invented ones)', () => {
    expect(previewCommissionAmount(MIN_RATE_BPS)).not.toBeNull()
    expect(previewCommissionAmount(MAX_RATE_BPS)).not.toBeNull()
  })
})
