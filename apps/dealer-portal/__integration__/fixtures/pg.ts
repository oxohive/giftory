import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Invokes pg-helper.cjs (see that file for why this indirection exists) as a child
 * process with NODE_PATH pointed at apps/mercato's node_modules, so `require('pg')`
 * resolves without this app needing its own `pg` dependency. `DATABASE_URL` is
 * inherited from this process's own env — the ephemeral integration harness sets it
 * to the real, disposable Postgres instance it just booted.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MERCATO_NODE_MODULES = path.resolve(__dirname, '..', '..', '..', 'mercato', 'node_modules')
const HELPER_PATH = path.join(__dirname, 'pg-helper.cjs')

export function pgCall<T = unknown>(command: string, args: Record<string, unknown> = {}): T {
  const out = execFileSync('node', [HELPER_PATH, command, JSON.stringify(args)], {
    env: { ...process.env, NODE_PATH: MERCATO_NODE_MODULES },
    encoding: 'utf8',
  })
  const parsed = JSON.parse(out) as { ok: boolean; result?: T; error?: string }
  if (!parsed.ok) throw new Error(`pg-helper ${command} failed: ${parsed.error}`)
  return parsed.result as T
}
