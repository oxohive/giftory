import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildEarningsQuery, buildLedgerQuery } from '../src/lib/features/finance/query.ts'

/**
 * Dealer-level isolation: "a dealer cannot see another dealer's balance/details by any means
 * (guessed ID, modified query param)". The backend already derives `dealerProfileId` from the
 * session and ignores a caller-supplied one on every dealer-facing commissions/payouts route
 * (resolveOwnDealerProfileId, verified by reading the route source) — but this UI must not even
 * try to supply one, since offering a dealer-id input/param anywhere would invite exactly the
 * "modified query param" attack the backend fix closed off. This is checked two ways: a
 * behavioral check on the query-builders (same functions EarningsView/LedgerView actually call),
 * and a static scan of every owned source file's executable code (comments excluded, since the
 * comments *describe* this guarantee in prose and legitimately say the word).
 */

test('neither query-builder accepts or produces a dealerProfileId, no matter what is passed in', () => {
  const earnings = buildEarningsQuery({ page: 1, pageSize: 25, dealerProfileId: 'guessed-other-dealer-id' })
  assert.ok(!('dealerProfileId' in earnings))

  const ledger = buildLedgerQuery({
    page: 1,
    pageSize: 25,
    entryType: 'commission_earned',
    direction: 'credit',
    dealerProfileId: 'guessed-other-dealer-id',
  })
  assert.ok(!('dealerProfileId' in ledger))
})

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const ROOTS = [
  join(TEST_DIR, '..', 'src', 'components', 'finance'),
  join(TEST_DIR, '..', 'src', 'lib', 'features', 'finance'),
  join(TEST_DIR, '..', 'src', 'app', '(portal)', 'earnings'),
  join(TEST_DIR, '..', 'src', 'app', '(portal)', 'ledger'),
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

/** Strips `/* ... *\/` and `// ...` comments so prose explaining the isolation guarantee (which
 *  legitimately names `dealerProfileId`) doesn't trip a scan for code that actually uses it. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const sources = ROOTS.flatMap(collectFiles).map((file) => ({ file, code: stripComments(readFileSync(file, 'utf8')) }))

test('found at least one owned source file to scan', () => {
  assert.ok(sources.length > 0, 'expected finance earnings/ledger source files to exist')
})

test('no executable code anywhere in the owned earnings/ledger surface references dealerProfileId', () => {
  for (const { file, code } of sources) {
    assert.doesNotMatch(code, /dealerProfileId/, `${file} references dealerProfileId outside a comment`)
  }
})

test('no file reads a dealer id out of route params or the query string', () => {
  const forbidden = /searchParams\.get\(\s*['"]dealerProfileId['"]|params\.dealerProfileId|params\?\.dealerProfileId|params\.id/
  for (const { file, code } of sources) {
    assert.doesNotMatch(code, forbidden, `${file} appears to read a dealer id from route params/query string`)
  }
})
