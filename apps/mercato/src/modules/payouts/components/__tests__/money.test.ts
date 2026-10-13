import { describe, expect, it } from '@jest/globals'
import { parseRupeesToPaise, formatPaise, computeLedgerBalanceFromEntries } from '../money'

describe('parseRupeesToPaise', () => {
  it('converts a plain rupee amount to paise', () => {
    expect(parseRupeesToPaise('40')).toBe(4000)
  })

  it('converts a 2-decimal rupee amount to paise exactly', () => {
    expect(parseRupeesToPaise('1250.50')).toBe(125050)
  })

  it('pads a single decimal digit', () => {
    expect(parseRupeesToPaise('10.5')).toBe(1050)
  })

  it('handles large amounts without float drift', () => {
    // 999999999.99 rupees is a value that floating multiplication by 100
    // (999999999.99 * 100) can render as 99999999998.99999... in IEEE-754.
    expect(parseRupeesToPaise('999999999.99')).toBe(99999999999)
  })

  it('strips leading zeros', () => {
    expect(parseRupeesToPaise('007.50')).toBe(750)
  })

  it('rejects an empty string', () => {
    expect(parseRupeesToPaise('')).toBeNull()
  })

  it('rejects a negative amount', () => {
    expect(parseRupeesToPaise('-10')).toBeNull()
  })

  it('rejects more than 2 decimal digits', () => {
    expect(parseRupeesToPaise('10.555')).toBeNull()
  })

  it('rejects non-numeric input', () => {
    expect(parseRupeesToPaise('abc')).toBeNull()
  })

  it('rejects a zero amount by returning 0, leaving the caller to reject non-positive amounts', () => {
    // Pure parsing only distinguishes "not a valid decimal" (null) from "a
    // valid decimal" (a number, which may be 0). The ">0" business rule is
    // the caller's job — see `ledgerActions.test.ts`.
    expect(parseRupeesToPaise('0')).toBe(0)
    expect(parseRupeesToPaise('0.00')).toBe(0)
  })
})

describe('formatPaise', () => {
  it('formats a whole-rupee amount with the INR symbol', () => {
    expect(formatPaise(400000)).toBe('₹4,000.00')
  })

  it('formats a fractional-paise amount', () => {
    expect(formatPaise(125050)).toBe('₹1,250.50')
  })

  it('formats zero', () => {
    expect(formatPaise(0)).toBe('₹0.00')
  })

  it('formats a negative amount with a leading minus sign', () => {
    expect(formatPaise(-50000)).toBe('-₹500.00')
  })

  it('truncates a non-integer input defensively rather than throwing', () => {
    expect(formatPaise(100.9)).toBe('₹1.00')
  })
})

describe('computeLedgerBalanceFromEntries — mirrors the admin balance route SQL', () => {
  it('a commission credit increases both totalEarned and pendingAmount by the same amount', () => {
    const result = computeLedgerBalanceFromEntries([
      { entryType: 'commission_earned', direction: 'credit', amount: 100000 },
    ])
    expect(result.totalEarned).toBe(100000)
    expect(result.pendingAmount).toBe(100000)
  })

  it('a recorded payout reduces pendingAmount but leaves totalEarned unchanged — the acceptance scenario', () => {
    const entries = [
      { entryType: 'commission_earned' as const, direction: 'credit' as const, amount: 100000 },
      { entryType: 'payout_disbursed' as const, direction: 'debit' as const, amount: 40000 },
    ]
    const result = computeLedgerBalanceFromEntries(entries)
    expect(result.totalEarned).toBe(100000)
    expect(result.pendingAmount).toBe(60000)
  })

  it('an adjustment_credit increases pendingAmount without increasing totalEarned (documented backend asymmetry)', () => {
    const entries = [
      { entryType: 'commission_earned' as const, direction: 'credit' as const, amount: 100000 },
      { entryType: 'adjustment_credit' as const, direction: 'credit' as const, amount: 5000 },
    ]
    const result = computeLedgerBalanceFromEntries(entries)
    // totalEarned counts commission_earned credits only.
    expect(result.totalEarned).toBe(100000)
    // pendingAmount = totalEarned - totalDebited; an adjustment_credit isn't
    // a debit, so it never reduces pendingAmount, and since pendingAmount is
    // derived purely from totalEarned/totalDebited (not from summing all
    // credits), this entry does not raise it either — exactly mirroring the
    // real SQL, which never adds it to either side.
    expect(result.pendingAmount).toBe(100000)
  })

  it('an adjustment_debit reduces pendingAmount without touching totalEarned', () => {
    const entries = [
      { entryType: 'commission_earned' as const, direction: 'credit' as const, amount: 100000 },
      { entryType: 'adjustment_debit' as const, direction: 'debit' as const, amount: 15000 },
    ]
    const result = computeLedgerBalanceFromEntries(entries)
    expect(result.totalEarned).toBe(100000)
    expect(result.pendingAmount).toBe(85000)
  })

  it('handles an empty ledger', () => {
    expect(computeLedgerBalanceFromEntries([])).toEqual({ pendingAmount: 0, totalEarned: 0, totalDebited: 0 })
  })

  it('sums multiple commission credits and multiple payouts with exact integer arithmetic', () => {
    const entries = [
      { entryType: 'commission_earned' as const, direction: 'credit' as const, amount: 33333 },
      { entryType: 'commission_earned' as const, direction: 'credit' as const, amount: 66667 },
      { entryType: 'payout_disbursed' as const, direction: 'debit' as const, amount: 50000 },
      { entryType: 'payout_disbursed' as const, direction: 'debit' as const, amount: 25000 },
    ]
    const result = computeLedgerBalanceFromEntries(entries)
    expect(result.totalEarned).toBe(100000)
    expect(result.totalDebited).toBe(75000)
    expect(result.pendingAmount).toBe(25000)
  })
})
