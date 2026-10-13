import { describe, expect, it } from '@jest/globals'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const COMPONENTS_DIR = join(__dirname, '..')

function readComponentSources(): Array<{ file: string; source: string }> {
  return readdirSync(COMPONENTS_DIR)
    .filter((name) => name.endsWith('.tsx'))
    .map((file) => ({ file, source: readFileSync(join(COMPONENTS_DIR, file), 'utf8') }))
}

function sourceOf(sources: Array<{ file: string; source: string }>, file: string): string {
  const entry = sources.find((s) => s.file === file)
  expect(entry).toBeDefined()
  return entry!.source
}

describe('dealer_org_rbac admin UI — source-level contract checks', () => {
  const sources = readComponentSources()

  it('found the expected component files', () => {
    expect(sources.map((s) => s.file).sort()).toEqual(
      ['CapabilitiesForm.tsx', 'DealerDetailView.tsx', 'DealersTable.tsx'].sort(),
    )
  })

  it('the directory list never wires a kycStatus or product-type filter — no server support exists for either', () => {
    const source = sourceOf(sources, 'DealersTable.tsx')
    expect(source).not.toMatch(/id:\s*['"]kycStatus['"]/)
    expect(source).not.toMatch(/id:\s*['"]productType/i)
    // The only `filters` entry this table defines is the free-text `state`
    // filter (see dealerDirectoryQuery.ts for why it's text, not a dropdown).
    expect(source).toMatch(/id:\s*['"]state['"]/)
  })

  it('no admin component calls raw fetch — every write/read goes through apiCall/apiCallOrThrow/readApiResultOrThrow/fetchCrudList', () => {
    for (const { file, source } of sources) {
      // Allow the identifier `fetch` to appear only as part of one of the
      // approved helper names; a bare `fetch(` call is disallowed.
      const bareFetchCalls = [...source.matchAll(/(?<![\w.])fetch\s*\(/g)]
      expect(`${file}: ${bareFetchCalls.length}`).toBe(`${file}: 0`)
    }
  })

  it('the capability form only ever issues a PUT — never a POST/PATCH/DELETE against capabilities', () => {
    const source = sourceOf(sources, 'CapabilitiesForm.tsx')
    const methods = [...source.matchAll(/method:\s*['"](\w+)['"]/g)].map((m) => m[1])
    expect(methods).toEqual(['PUT'])
  })

  it('the Save/Reset actions are only rendered when the caller can manage — never shown unconditionally', () => {
    const source = sourceOf(sources, 'CapabilitiesForm.tsx')
    expect(source).toMatch(/\{canManage \? \(/)
  })

  it('a read-only caller sees an explicit notice, not a silently missing control', () => {
    const source = sourceOf(sources, 'CapabilitiesForm.tsx')
    expect(source).toMatch(/\{!canManage \? \(/)
    expect(source).toMatch(/readOnlyNotice/)
  })

  it('a successful save triggers a server refetch rather than locally echoing the submitted payload', () => {
    const detailSource = sourceOf(sources, 'DealerDetailView.tsx')
    const formSource = sourceOf(sources, 'CapabilitiesForm.tsx')
    // The parent invalidates the query that feeds `capabilities` back into
    // this form from the server...
    expect(detailSource).toMatch(/invalidateQueries/)
    // ...and the form itself never sets its own "saved" state from the
    // payload it just sent — it only calls the `onSaved` callback and lets
    // the refetched `capabilities` prop (handled by the `useEffect` below)
    // resync local state.
    expect(formSource).not.toMatch(/setValues\(\s*values\s*\)/)
    expect(formSource).toMatch(/onSaved\(\)/)
    expect(formSource).toMatch(/useEffect\(\(\) => \{\s*setValues\(toFormValues\(capabilities\)\)/)
  })
})
