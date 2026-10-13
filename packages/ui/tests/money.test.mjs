import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatBps, formatMoney, toMajorUnits, toMinorUnits } from '../src/money.ts'

test('formatMoney renders integer paise directly as rupees', () => {
  // Regression guard for the documented footgun (tasks/phase-2-ui/CONTRACT-HANDOFF.md):
  // commissions/payouts amounts are ALREADY integer paise. formatMoney must render them
  // as-is, with no prior toMinorUnits conversion.
  assert.equal(formatMoney(149900), '₹1,499.00')
  assert.equal(formatMoney(0), '₹0.00')
})

test('toMinorUnits converts a Phase-1 decimal major-unit value from Open Mercato', () => {
  assert.equal(toMinorUnits('1499.00'), 149900)
  assert.equal(toMinorUnits(1499), 149900)
  assert.equal(toMinorUnits(null), null)
  assert.equal(toMinorUnits(undefined), null)
  assert.equal(toMinorUnits(''), null)
  assert.equal(toMinorUnits('not-a-number'), null)
})

test('toMajorUnits reverses toMinorUnits', () => {
  assert.equal(toMajorUnits(149900), 1499)
})

test('formatBps renders basis points as a percentage (100 bps = 1%)', () => {
  assert.equal(formatBps(500), '5%')
  assert.equal(formatBps(10000), '100%')
  assert.equal(formatBps(1), '0.01%')
  assert.equal(formatBps(0), '0%')
})
