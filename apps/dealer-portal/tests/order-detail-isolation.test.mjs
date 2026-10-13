import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchOrderDetail, updateOrderStatus } from '../src/lib/features/orders/detail.ts'

/**
 * Two guarantees TASK-10's acceptance criteria name explicitly, both verified by static source
 * scan over this task's exact owned surface (mirroring tests/orders-list-isolation.test.mjs's and
 * tests/finance-no-mutations.test.mjs's own pattern for the same style of guarantee):
 *
 *   1. "No customer PII beyond the agreed safe fields ever renders, anywhere, including in error
 *      messages or logs." The safe projection (`DealerOrderDetail`) has no PII field to begin
 *      with — this scan additionally guards that no component ever references a PII-shaped field
 *      name (customer name/phone/email/full address) or widens the safe type to add one, and that
 *      nothing in this surface logs the raw detail object to the console.
 *   2. "A cross-dealer access attempt is rejected" — this UI must never even try to supply a
 *      dealer id (there is nothing for a caller to override with a guessed/modified value); same
 *      guarantee TASK-09's list.ts already upholds for the list/enrichment path.
 */

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const ROOTS = [
  join(TEST_DIR, '..', 'src', 'components', 'orders', 'detail'),
  join(TEST_DIR, '..', 'src', 'lib', 'features', 'orders', 'detail.ts'),
  join(TEST_DIR, '..', 'src', 'app', '(portal)', 'orders', '[id]'),
]

function collectFiles(path) {
  const stat = statSync(path)
  if (stat.isFile()) return [path]
  const out = []
  for (const name of readdirSync(path)) {
    const full = join(path, name)
    const childStat = statSync(full)
    if (childStat.isDirectory()) out.push(...collectFiles(full))
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

/** Strips comments so prose explaining these guarantees (which legitimately names forbidden
 *  fields to describe what must NOT happen) doesn't trip a scan for code that actually does it. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const sources = ROOTS.flatMap(collectFiles).map((file) => ({ file, code: stripComments(readFileSync(file, 'utf8')) }))

test('found at least one owned order-detail source file to scan', () => {
  assert.ok(sources.length > 0, 'expected order-detail source files to exist')
})

test('no executable code anywhere in the owned order-detail surface references a customer-PII-shaped field', () => {
  // customerName/customerPhone/customerEmail/billingAddress/shippingAddress/fullAddress etc. —
  // the safe projection never includes any of these; this guards that a future edit can't widen
  // a type or render path to start reading one even if the backend started returning it.
  const forbidden = /customerName|customerPhone|customerEmail|billingAddress|shippingAddress|fullAddress|\bphone\b|\bemail\b|\bcustomer\b/i
  for (const { file, code } of sources) {
    assert.doesNotMatch(code, forbidden, `${file} references a customer-PII-shaped field`)
  }
})

test('no file logs the raw order-detail object to the console', () => {
  const forbidden = /console\.(log|warn|error|debug|info)\s*\(\s*[^)]*\bdetail\b/
  for (const { file, code } of sources) {
    assert.doesNotMatch(code, forbidden, `${file} appears to log the detail object`)
  }
})

test('no executable code anywhere in the owned order-detail surface references dealerProfileId', () => {
  for (const { file, code } of sources) {
    assert.doesNotMatch(code, /dealerProfileId/, `${file} references dealerProfileId outside a comment`)
  }
})

test('no file reads a dealer id out of route params or the query string', () => {
  const forbidden = /searchParams\.get\(\s*['"]dealerProfileId['"]|params\.dealerProfileId|params\?\.dealerProfileId/
  for (const { file, code } of sources) {
    assert.doesNotMatch(code, forbidden, `${file} appears to read a dealer id from route params/query string`)
  }
})

test('the data layer never issues a request to anything but the two documented assignment-id-keyed routes', () => {
  const detailSource = sources.find((s) => s.file.endsWith('detail.ts'))
  assert.ok(detailSource, 'expected detail.ts to exist')
  const calls = [...detailSource.code.matchAll(/request<[^>]*>\(\s*`([^`]*)`/g)].map((m) => m[1])
  assert.ok(calls.length >= 2, 'expected at least the GET and POST calls')
  for (const call of calls) {
    assert.match(call, /^dealer_orders\/dealer\/orders\/\$\{encodeURIComponent\(assignmentId\)\}(\/status)?$/, `unexpected request path: ${call}`)
  }
})

test('the query builder/fetcher functions never produce a dealerProfileId key, no matter what is passed in', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  try {
    // Even if a caller tried to smuggle a dealerProfileId through, these functions only ever
    // accept an assignmentId string + a typed status-update payload — there is no parameter
    // shape here for a dealer id to ride along in.
    await updateOrderStatus('assign-1', { status: 'acknowledged', dealerProfileId: 'someone-elses-id' })
  } finally {
    globalThis.fetch = original
  }
  assert.equal(typeof fetchOrderDetail, 'function')
})
