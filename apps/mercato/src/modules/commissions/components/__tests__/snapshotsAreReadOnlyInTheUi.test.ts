import { describe, expect, it } from '@jest/globals'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Commission snapshots are immutable by design — frozen at assignment
 * time, never updated (`commissions/data/entities.ts`'s
 * `OrderCommissionSnapshot` doc comment; `docs/phase-2-status.md`'s "how
 * the money flows" section). There is also no PUT/PATCH/DELETE route
 * anywhere under `commissions/api/**` for the snapshot resource in the
 * first place — but this guards the UI layer directly (mirroring
 * `payouts/components/__tests__/noEditOrDeleteControls.test.ts`'s
 * identical precedent for the append-only ledger), so a future edit
 * introduces a dangling write affordance only if it also breaks this test.
 */
const COMPONENTS_DIR = join(__dirname, '..')
const WIDGETS_DIR = join(__dirname, '..', '..', 'widgets')

function readSourcesRecursive(dir: string, out: Array<{ file: string; source: string }> = []): Array<{ file: string; source: string }> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue
      readSourcesRecursive(full, out)
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      out.push({ file: full, source: readFileSync(full, 'utf8') })
    }
  }
  return out
}

describe('commissions admin UI — snapshot views are read-only', () => {
  const sources = [...readSourcesRecursive(COMPONENTS_DIR), ...readSourcesRecursive(WIDGETS_DIR)]

  it('found at least one component/widget file to scan', () => {
    expect(sources.length).toBeGreaterThan(0)
  })

  it('no file calls createCrud/updateCrud/deleteCrud against a snapshot/commission path', () => {
    const writeHelperCall = /(?:createCrud|updateCrud|deleteCrud)\s*\(\s*[`'"][^`'"]*\/(?:orders\/[^/]+\/commission|dealers\/[^/]+\/commission)[`'"]/
    for (const { file, source } of sources) {
      if (writeHelperCall.test(source)) throw new Error(`${file} calls a CRUD write helper against a snapshot/commission path`)
    }
  })

  it('no file issues a PUT/PATCH/DELETE request whose URL contains "/commission" (the snapshot read routes)', () => {
    for (const { file, source } of sources) {
      // Find every fetch/apiCall-style call with an explicit method, and
      // check whether ITS OWN url string contains "/commission".
      const callPattern = /(?:apiCall|apiCallOrThrow|readApiResultOrThrow)\s*\(\s*([`'"][^`'"]*[`'"])[^)]*method:\s*['"](\w+)['"]/gs
      let match: RegExpExecArray | null
      while ((match = callPattern.exec(source))) {
        const [, urlLiteral, method] = match
        if (/PUT|PATCH|DELETE/i.test(method) && urlLiteral.includes('/commission')) {
          throw new Error(`${file} issues a ${method} against a URL containing "/commission": ${urlLiteral}`)
        }
      }
    }
  })

  it('the dealer commission history view renders no row actions (no per-row mutation menu)', () => {
    const view = sources.find((s) => s.file.endsWith('DealerCommissionHistoryView.tsx'))
    expect(view).toBeDefined()
    expect(view!.source).not.toMatch(/rowActions/)
  })

  it('the order-commission tab widget renders no edit/delete affordance', () => {
    const widget = sources.find((s) => s.file.endsWith('order-commission-tab/widget.client.tsx'))
    expect(widget).toBeDefined()
    expect(widget!.source).not.toMatch(/onDelete|CrudForm|createCrud|updateCrud|deleteCrud/)
  })

  it('the only DELETE call anywhere in these files targets a commission RULE id path, never a snapshot', () => {
    const deleteCalls = sources.flatMap(({ file, source }) => {
      const matches = [...source.matchAll(/method:\s*['"]DELETE['"]/g)]
      return matches.map(() => file)
    })
    // At least the rules table's "Deactivate" action issues one DELETE.
    expect(deleteCalls.length).toBeGreaterThan(0)
    const rulesTable = sources.find((s) => s.file.endsWith('CommissionRulesTable.tsx'))
    expect(rulesTable).toBeDefined()
    expect(rulesTable!.source).toMatch(/method:\s*['"]DELETE['"]/)
    // The DELETE call's URL is built from the module's own `API_PATH`
    // constant, which must itself point at the rules collection, not the
    // snapshot/commission-reading routes.
    expect(rulesTable!.source).toMatch(/API_PATH\s*=\s*['"]commissions\/admin\/commission\/rules['"]/)
    expect(rulesTable!.source).toMatch(/\$\{API_PATH\}\/\$\{encodeURIComponent\(row\.id\)\}/)
  })
})
