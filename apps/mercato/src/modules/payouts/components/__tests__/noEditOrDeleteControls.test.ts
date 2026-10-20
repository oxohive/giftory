import { describe, expect, it } from '@jest/globals'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The ledger is append-only by construction — "there are no update or
 * delete paths anywhere in payouts" (docs/phase-2-status.md). This UI must
 * never offer to edit or delete a ledger entry; corrections are new
 * adjustment entries, never edits. There is no backend PUT/PATCH/DELETE
 * route to call in the first place, but this guards the UI layer directly
 * (not just "no route exists to call") so a future edit introduces a
 * dangling affordance only if it also breaks this test.
 */
const COMPONENTS_DIR = join(__dirname, '..')

function readComponentSources(): Array<{ file: string; source: string }> {
  return readdirSync(COMPONENTS_DIR)
    .filter((name) => name.endsWith('.tsx'))
    .map((file) => ({ file, source: readFileSync(join(COMPONENTS_DIR, file), 'utf8') }))
}

describe('payouts admin components — no edit or delete controls', () => {
  const sources = readComponentSources()

  it('found at least one component file to scan', () => {
    expect(sources.length).toBeGreaterThan(0)
  })

  it('the ledger entries table renders no per-row action menu', () => {
    const view = sources.find((s) => s.file === 'DealerLedgerView.tsx')
    expect(view).toBeDefined()
    expect(view!.source).not.toMatch(/rowActions/)
  })

  it('no component calls updateCrud/deleteCrud against ledger entries', () => {
    for (const { file, source } of sources) {
      expect(`${file}: ${/updateCrud\s*\(/.test(source)}`).toBe(`${file}: false`)
      expect(`${file}: ${/deleteCrud\s*\(/.test(source)}`).toBe(`${file}: false`)
    }
  })

  it('no component issues a PUT/PATCH/DELETE request', () => {
    for (const { file, source } of sources) {
      const methods = [...source.matchAll(/method:\s*['"](\w+)['"]/g)].map((m) => m[1])
      for (const method of methods) {
        expect(`${file}: ${method}`).not.toMatch(/: (PUT|PATCH|DELETE)$/)
      }
    }
  })
})
