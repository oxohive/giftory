import { describe, expect, it } from '@jest/globals'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

/**
 * CLAUDE.md: never expose tenantId, organizationId, or user PII in logs.
 * Scans every logger call in this module's non-test source and fails if its
 * arguments mention a tenant/org id or dealer PII field.
 */

const MODULE_ROOT = join(__dirname, '..')
const FORBIDDEN = /\b(tenantId|tenant_id|organizationId|organization_id|orgId|contactEmail|email|phone|gstin|pan)\b/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full)
    return /\.tsx?$/.test(name) ? [full] : []
  })
}

/** Returns the full text of each `logger.<level>(...)` / `console.<level>(...)` call. */
function logCalls(source: string): string[] {
  const calls: string[] = []
  const pattern = /\b(?:logger|console)\.(?:debug|info|warn|error|log)\(/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) {
    let depth = 1
    let i = match.index + match[0].length
    while (i < source.length && depth > 0) {
      if (source[i] === '(') depth++
      else if (source[i] === ')') depth--
      i++
    }
    calls.push(source.slice(match.index, i))
  }
  return calls
}

/** Message text may say "email sent"; only identifiers (keys/values passed to the logger) matter. */
function stripStringLiterals(code: string): string {
  return code.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''")
}

describe('dealer_onboarding logging', () => {
  const files = sourceFiles(MODULE_ROOT)

  it('finds the module log calls it is meant to guard', () => {
    const total = files.reduce((n, file) => n + logCalls(readFileSync(file, 'utf8')).length, 0)
    expect(total).toBeGreaterThanOrEqual(3)
  })

  it('never logs tenant/organization ids or dealer PII', () => {
    const offenders = files.flatMap((file) =>
      logCalls(readFileSync(file, 'utf8'))
        .filter((call) => FORBIDDEN.test(stripStringLiterals(call)))
        .map((call) => `${relative(MODULE_ROOT, file)}: ${call.replace(/\s+/g, ' ')}`),
    )
    expect(offenders).toEqual([])
  })
})
