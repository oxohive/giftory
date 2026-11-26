import { describe, expect, it } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'

/**
 * CLAUDE.md: "Never expose tenantId, organizationId, or user PII in logs".
 * Static guard over every logger call in the dealer-marketplace modules'
 * server code (subscribers, commands, libs, routes): no log payload may carry
 * a tenant or organization id.
 */
const MODULES_ROOT = path.join(__dirname, '..', '..')
const MODULES = ['dealer_orders', 'commissions', 'payouts']
const SKIP_DIRS = new Set(['__tests__', '__integration__', 'components', 'widgets', 'backend', 'migrations', 'i18n'])

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(path.join(dir, entry.name), out)
    } else if (entry.name.endsWith('.ts')) {
      out.push(path.join(dir, entry.name))
    }
  }
  return out
}

const LOG_CALL = /logger\.(?:info|warn|error|debug)\(([\s\S]*?)\)\s*$/gm

describe('no tenant/organization ids in dealer-marketplace logs', () => {
  const files = MODULES.flatMap((m) => collect(path.join(MODULES_ROOT, m)))

  it('finds the module sources to scan', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  for (const file of files) {
    const rel = path.relative(MODULES_ROOT, file).split(path.sep).join('/')
    it(`${rel} logs no tenantId / organizationId`, () => {
      const source = fs.readFileSync(file, 'utf8')
      const offending: string[] = []
      for (const match of source.matchAll(LOG_CALL)) {
        if (/\b(tenantId|organizationId|orgId)\b/.test(match[1])) offending.push(match[0].slice(0, 160))
      }
      expect(offending).toEqual([])
    })
  }
})
