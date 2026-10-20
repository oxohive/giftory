import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatMoney } from '@gift/ui/money'
import {
  balanceTone,
  commissionRateLabel,
  entryTone,
  entryTypeLabel,
  formatSignedAmount,
} from '../src/lib/features/finance/display.ts'

// --- balanceTone: a zero balance must be its own real state, never confused with "no data yet"
// (that is represented separately, by the caller passing `null`, not by this function).

test('balanceTone: zero is its own state, not folded into positive or negative', () => {
  assert.equal(balanceTone(0), 'zero')
})

test('balanceTone: boundary values around zero', () => {
  assert.equal(balanceTone(1), 'positive')
  assert.equal(balanceTone(-1), 'negative')
  assert.equal(balanceTone(Number.MAX_SAFE_INTEGER), 'positive')
  assert.equal(balanceTone(-Number.MAX_SAFE_INTEGER), 'negative')
})

// --- entryTypeLabel: every real backend enum value gets a human label; nothing falls through blank.

test('entryTypeLabel covers every LedgerEntryType the backend can send', () => {
  assert.equal(entryTypeLabel('commission_earned'), 'Commission earned')
  assert.equal(entryTypeLabel('payout_disbursed'), 'Payout disbursed')
  assert.equal(entryTypeLabel('adjustment_credit'), 'Adjustment (credit)')
  assert.equal(entryTypeLabel('adjustment_debit'), 'Adjustment (debit)')
})

test('entryTone maps credit/debit directly, with no third state', () => {
  assert.equal(entryTone('credit'), 'credit')
  assert.equal(entryTone('debit'), 'debit')
})

// --- formatSignedAmount: sign is a prefix on top of formatMoney(Math.abs(...)), at paise
// boundary values — verifies there is no double-negative and no drift introduced by this layer
// (it never multiplies/divides the paise amount itself).

test('formatSignedAmount: zero paise renders as zero, not blank, for both directions', () => {
  assert.equal(formatSignedAmount(0, 'credit'), `+ ${formatMoney(0)}`)
  assert.equal(formatSignedAmount(0, 'debit'), `− ${formatMoney(0)}`)
})

test('formatSignedAmount: smallest unit (1 paise) round-trips exactly', () => {
  assert.equal(formatSignedAmount(1, 'credit'), `+ ${formatMoney(1)}`)
  assert.equal(formatSignedAmount(1, 'debit'), `− ${formatMoney(1)}`)
})

test('formatSignedAmount: a non-round-rupee amount (333 paise = ₹3.33) shows no drift', () => {
  assert.equal(formatSignedAmount(333, 'credit'), `+ ${formatMoney(333)}`)
  assert.equal(formatMoney(333), '₹3.33')
})

test('formatSignedAmount: large boundary value (Number.MAX_SAFE_INTEGER paise)', () => {
  assert.equal(formatSignedAmount(Number.MAX_SAFE_INTEGER, 'credit'), `+ ${formatMoney(Number.MAX_SAFE_INTEGER)}`)
})

test('formatSignedAmount: never double-negates a direction=debit amount that is itself negative', () => {
  // Ledger entries always record a positive `amount` server-side, but this guards the display
  // layer defensively: a stray negative input must not render two minus signs.
  assert.equal(formatSignedAmount(-150, 'debit'), `− ${formatMoney(150)}`)
})

test('formatSignedAmount propagates a non-INR currency code through to formatMoney', () => {
  assert.equal(formatSignedAmount(500, 'credit', 'USD'), `+ ${formatMoney(500, 'USD')}`)
})

// --- commissionRateLabel: the 0-bps/no-rule fallback must read as "no rule configured", not
// "dealer earns nothing" — and a real rate always goes through formatBps unlabeled.

test('commissionRateLabel: a real rule at a real rate formats as a percentage', () => {
  assert.equal(commissionRateLabel({ commissionRateBps: 800, ruleId: 'rule-1' }), '8%')
  assert.equal(commissionRateLabel({ commissionRateBps: 1250, ruleId: 'rule-2' }), '12.5%')
})

test('commissionRateLabel: explicit no-active-rule fallback (0 bps, no ruleId)', () => {
  assert.equal(commissionRateLabel({ commissionRateBps: 0, ruleId: null }), 'No active rule')
})

test('commissionRateLabel: a genuine 0% rule (ruleId present) is distinct from the no-rule fallback', () => {
  assert.equal(commissionRateLabel({ commissionRateBps: 0, ruleId: 'rule-zero' }), '0%')
})

test('commissionRateLabel: max rate boundary (10000 bps = 100%)', () => {
  assert.equal(commissionRateLabel({ commissionRateBps: 10000, ruleId: 'rule-3' }), '100%')
})
