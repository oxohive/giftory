import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pageCount } from '../src/pagination-math.ts'

test('computes page count from a real {total,pageSize} list response', () => {
  assert.equal(pageCount(0, 25), 1)
  assert.equal(pageCount(25, 25), 1)
  assert.equal(pageCount(26, 25), 2)
  assert.equal(pageCount(100, 25), 4)
})

test('never returns fewer than 1 page, even with zero items', () => {
  assert.equal(pageCount(0, 0), 1)
})

test('treats a degenerate pageSize as 1 rather than dividing by zero', () => {
  assert.equal(pageCount(10, 0), 10)
})
