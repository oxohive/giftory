import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Static source scan over every file this task owns, mirroring the dealer-facing finance
 * screens' own "no mutation" scan (tests/finance-no-mutations.test.mjs) — adapted for a surface
 * that IS allowed one specific mutation (capabilities) but explicitly forbids another
 * (business-identity fields: businessName/contactEmail/phone/businessType/city/state/pincode/
 * gstin/pan — API-CONTRACTS.md's "Business-profile edit scope": no dealer-facing endpoint edits
 * these post-approval, so this task's own briefing forbids building an editor for them).
 */

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const ROOTS = [
  join(TEST_DIR, '..', 'src', 'components', 'profile'),
  join(TEST_DIR, '..', 'src', 'lib', 'features', 'profile'),
  join(TEST_DIR, '..', 'src', 'app', '(portal)', 'profile'),
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

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const sources = ROOTS.flatMap(collectFiles).map((file) => ({ file, code: stripComments(readFileSync(file, 'utf8')) }))

test('found at least one owned source file to scan', () => {
  assert.ok(sources.length > 0, 'expected profile/capabilities source files to exist')
})

test('the only mutating request anywhere in this surface targets the capabilities PUT path', () => {
  for (const { file, code } of sources) {
    const calls = [...code.matchAll(/method:\s*['"](\w+)['"]/g)]
    for (const call of calls) {
      assert.match(call[1], /^PUT$/, `${file} issues a non-PUT mutating request (${call[1]})`)
    }
  }
  // Exactly one call site should build a mutating request at all (api.ts's saveDealerCapabilities).
  const mutatingFiles = sources.filter(({ code }) => /method:\s*['"]/.test(code)).map(({ file }) => file)
  assert.equal(mutatingFiles.length, 1, `expected exactly one file issuing a mutating request, got: ${mutatingFiles.join(', ')}`)
  assert.match(mutatingFiles[0], /lib[\\/]features[\\/]profile[\\/]api\.ts$/)
})

test('no file submits businessName/contactEmail/phone/businessType/city/state/pincode/gstin/pan for writing', () => {
  // Reading/displaying these fields is fine (BusinessProfileCard) — this specifically guards
  // against a form/payload that would SEND one of them back to the server.
  const forbidden = /(set[A-Z]\w*|payload\.|body\.)?\b(businessName|contactEmail|phone|businessType|city|state(?!ValuesEqual)|pincode|gstin|pan)\s*:\s*values\./
  for (const { file, code } of sources) {
    assert.doesNotMatch(code, forbidden, `${file} appears to build a payload field for a business-identity value`)
  }
})

test('no identity-edit <form>/onSubmit exists outside the capabilities edit view', () => {
  for (const { file, code } of sources) {
    if (file.endsWith('CapabilitiesEditView.tsx')) continue
    assert.doesNotMatch(code, /onSubmit=/, `${file} wires an onSubmit handler outside the capabilities editor`)
  }
})

test('the capabilities edit route is gated with requireRole([\'dealer:owner\']), not requireApprovedDealer alone', () => {
  const pagePath = join(TEST_DIR, '..', 'src', 'app', '(portal)', 'profile', 'capabilities', 'page.tsx')
  const code = readFileSync(pagePath, 'utf8')
  assert.match(code, /requireRole\(\s*\[\s*['"]dealer:owner['"]\s*\]/)
})

test('the /profile page uses requireApprovedDealer (both roles can view), not an owner-only gate', () => {
  const pagePath = join(TEST_DIR, '..', 'src', 'app', '(portal)', 'profile', 'page.tsx')
  const code = readFileSync(pagePath, 'utf8')
  assert.match(code, /requireApprovedDealer\(/)
  assert.doesNotMatch(code, /requireRole\(/)
})
