import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDate, formatDateTime } from '../src/datetime.ts'

test('formatDate renders a YYYY-MM-DD contract field (e.g. requiredBy, effectiveFrom)', () => {
  assert.equal(formatDate('2026-01-15'), '15 Jan 2026')
})

test('formatDate falls back for missing/invalid values rather than throwing', () => {
  assert.equal(formatDate(null), 'Not provided')
  assert.equal(formatDate(undefined), 'Not provided')
  assert.equal(formatDate('not-a-date'), 'Not provided')
})

test('formatDateTime renders a UTC ISO timestamp (e.g. assignedAt) in Asia/Kolkata', () => {
  // 10:00 UTC -> 15:30 IST (UTC+5:30).
  assert.equal(formatDateTime('2026-01-15T10:00:00Z'), '15 Jan 2026, 3:30 pm')
})

test('formatDateTime falls back for missing/invalid values rather than throwing', () => {
  assert.equal(formatDateTime(null), 'Not provided')
  assert.equal(formatDateTime('not-a-date'), 'Not provided')
})
