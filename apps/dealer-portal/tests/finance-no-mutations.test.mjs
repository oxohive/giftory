import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Static source scan over every file this task owns — mirrors the admin payouts UI's own
 * "append-only, no edit controls" test (apps/mercato/src/modules/payouts/components/__tests__/
 * noEditOrDeleteControls.test.ts), adapted for this app. The dealer-facing earnings/ledger
 * screens are read-only by design: snapshots are immutable, the ledger is append-only, and there
 * is no payout/adjustment-recording UI anywhere in this app (that is admin-only, in a different
 * app entirely). This test guards the UI layer directly, not just "no mutating route exists to
 * call" — a future edit introduces a mutating affordance only if it also breaks this test.
 */

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

function readSources() {
  return ROOTS.flatMap(collectFiles).map((file) => ({ file, source: readFileSync(file, 'utf8') }))
}

const sources = readSources()

test('found at least one owned source file to scan', () => {
  assert.ok(sources.length > 0, 'expected finance earnings/ledger source files to exist')
})

test('no file issues a mutating HTTP method (POST/PUT/PATCH/DELETE) against any API', () => {
  for (const { file, source } of sources) {
    const methods = [...source.matchAll(/method:\s*['"](\w+)['"]/g)].map((m) => m[1])
    for (const method of methods) {
      assert.doesNotMatch(method, /^(POST|PUT|PATCH|DELETE)$/, `${file} issues a ${method} request`)
    }
  }
})

test('no file calls a record/create/update/delete action against commissions or payouts', () => {
  const forbidden = /recordPayout|createAdjustment|deactivate|deleteLedger|updateLedger|editLedger/i
  for (const { file, source } of sources) {
    assert.doesNotMatch(source, forbidden, `${file} appears to call a mutating action`)
  }
})

test('no table renders a per-row action/edit/delete menu', () => {
  const forbidden = /rowActions|onEdit|onDelete/
  for (const { file, source } of sources) {
    assert.doesNotMatch(source, forbidden, `${file} appears to render a per-row mutation control`)
  }
})

test('no component renders a <form> (there is nothing in this UI for a dealer to submit)', () => {
  for (const { file, source } of sources) {
    assert.doesNotMatch(source, /<form[\s>]/, `${file} renders a <form> element`)
    assert.doesNotMatch(source, /onSubmit=/, `${file} wires an onSubmit handler`)
  }
})
