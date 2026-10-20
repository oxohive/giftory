import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildOrdersQuery, DEFAULT_ORDERS_LIST_STATE } from '../src/lib/features/orders/list.ts'

/**
 * Dealer-level isolation, mirroring tests/finance-isolation.test.mjs's own pattern for the same
 * guarantee: "a dealer cannot see another dealer's orders by any means (guessed id, modified
 * query param)". `GET /api/dealer_orders/dealer/orders` and `GET .../dealer/orders/{id}` both
 * derive the caller's own dealer profile from the session server-side
 * (`resolveOwnDealerProfileId`, verified against `dealer_orders/commands/shared.ts` and its
 * `dealerScope.test.ts` fail-closed coverage) and ignore a caller-supplied `dealerProfileId` —
 * but this UI must not even try to supply one, since offering a dealer-id input/param anywhere
 * would invite exactly the "modified query param" attack the backend fix closed off.
 *
 * Also guards the companion correctness property the task's acceptance criteria call out
 * explicitly: nothing in this owned surface may re-sort/reorder a server-sorted page client-side,
 * since that would silently break cross-page `requiredBy` ordering once there is more than one
 * page of results (list.ts's `fetchOrdersListPage`/`enrichAssignments` preserve the backend's
 * order by construction — see tests/orders-list-data.test.mjs for the behavioral proof; this file
 * guards it staying that way via a static scan).
 */

test('the query builder never produces a dealerProfileId key, no matter what is passed in', () => {
  const query = buildOrdersQuery({ ...DEFAULT_ORDERS_LIST_STATE, dealerProfileId: 'guessed-other-dealer-id' })
  assert.ok(!('dealerProfileId' in query))
})

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const ROOTS = [
  join(TEST_DIR, '..', 'src', 'components', 'orders'),
  join(TEST_DIR, '..', 'src', 'lib', 'features', 'orders'),
  join(TEST_DIR, '..', 'src', 'app', '(portal)', 'orders'),
]

function collectFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) out.push(...collectFiles(full))
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

/** Strips comments so prose explaining these guarantees (which legitimately names
 *  `dealerProfileId` and describes sorting) doesn't trip a scan for code that actually does it. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const sources = ROOTS.flatMap(collectFiles).map((file) => ({ file, code: stripComments(readFileSync(file, 'utf8')) }))

test('found at least one owned orders-list source file to scan', () => {
  assert.ok(sources.length > 0, 'expected orders-list source files to exist')
})

test('no executable code anywhere in the owned orders-list surface references dealerProfileId', () => {
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

test('no file re-sorts a fetched page client-side (.sort(), which would silently break cross-page ordering)', () => {
  for (const { file, code } of sources) {
    assert.doesNotMatch(code, /\.sort\s*\(/, `${file} calls .sort() on a list — cross-page server ordering must be preserved as-is`)
  }
})

test('the filter-change handler always resets to page 1 (status/sort changes never keep a stale page number)', () => {
  const view = sources.find((s) => s.file.endsWith('OrdersListView.tsx'))
  assert.ok(view, 'expected OrdersListView.tsx to exist')
  assert.match(
    view.code,
    /handleFiltersChange[\s\S]{0,200}page:\s*1/,
    'OrdersListView.tsx\'s filter-change handler must reset page to 1',
  )
})
