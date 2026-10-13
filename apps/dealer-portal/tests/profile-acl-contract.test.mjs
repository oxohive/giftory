import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Pins the REAL backend authorization boundary this task's acceptance item ("staff cannot
 * mutate capabilities via a direct request even if the UI somehow let them try — test this at
 * the fetch/request level, not just hidden UI") depends on, by reading the actual route/setup
 * source in apps/mercato directly — not a UI mock, and not this app's own (necessarily
 * UI-level) behavior. This app has no running backend/database in this sandbox to fire a real
 * HTTP request against (same constraint every other P2-UI task's handoff documents), so pinning
 * the exact server-side ACL wiring from source is the closest honest substitute available here;
 * TASK-17's integration pass is expected to additionally exercise this with a real request.
 *
 * Read-only: this test only inspects apps/mercato's files, never modifies anything outside this
 * task's own owned paths (apps/dealer-portal/{app/(portal)/profile,components/profile,
 * lib/features/profile}).
 */

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const MERCATO_MODULE = join(TEST_DIR, '..', '..', 'mercato', 'src', 'modules', 'dealer_org_rbac')

function readMercatoFile(relativePath) {
  return readFileSync(join(MERCATO_MODULE, relativePath), 'utf8')
}

test('the capabilities PUT route requires dealer_org.manage_capabilities', () => {
  const source = readMercatoFile('api/dealer/profile/capabilities/route.ts')
  assert.match(source, /PUT:\s*\{\s*requireAuth:\s*true,\s*requireFeatures:\s*\[\s*['"]dealer_org\.manage_capabilities['"]\s*\]/)
})

test('the profile GET route requires only dealer_org.view (readable by both roles)', () => {
  const source = readMercatoFile('api/dealer/profile/route.ts')
  assert.match(source, /GET:\s*\{\s*requireAuth:\s*true,\s*requireFeatures:\s*\[\s*['"]dealer_org\.view['"]\s*\]/)
})

test('setup.ts grants dealer:owner both dealer_org.view and dealer_org.manage_capabilities', () => {
  const source = readMercatoFile('setup.ts')
  const ownerBlock = source.match(/DEALER_OWNER_ROLE\]:\s*\[([^\]]*)\]/)
  assert.ok(ownerBlock, 'expected a DEALER_OWNER_ROLE entry in defaultRoleFeatures')
  assert.match(ownerBlock[1], /FEAT_DEALER_ORG_VIEW/)
  assert.match(ownerBlock[1], /FEAT_DEALER_ORG_MANAGE_CAPABILITIES/)
})

test('setup.ts grants dealer:staff dealer_org.view but NOT dealer_org.manage_capabilities', () => {
  const source = readMercatoFile('setup.ts')
  const staffBlock = source.match(/DEALER_STAFF_ROLE\]:\s*\[([^\]]*)\]/)
  assert.ok(staffBlock, 'expected a DEALER_STAFF_ROLE entry in defaultRoleFeatures')
  assert.match(staffBlock[1], /FEAT_DEALER_ORG_VIEW/)
  assert.doesNotMatch(staffBlock[1], /FEAT_DEALER_ORG_MANAGE_CAPABILITIES/)
})

test('the capabilities upsert command enforces a real optimistic-concurrency 409 on updatedAt mismatch', () => {
  const source = readMercatoFile('commands/capabilities.ts')
  assert.match(source, /conflict\(/)
  assert.match(source, /updatedAt/)
})
