import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Pins the REAL backend authorization boundary this task's acceptance item ("a staff (non-owner)
 * caller cannot invoke the invite/deactivate endpoints even via a direct request") depends on, by
 * reading the actual route/setup/command source in apps/mercato directly — not a UI mock. This
 * app has no running backend/database in this sandbox to fire a real HTTP request against (same
 * constraint documented in tests/profile-acl-contract.test.mjs); pinning the exact server-side
 * ACL wiring and the self-deactivation/staff-only-target guards from source is the closest honest
 * substitute available here. TASK-17's integration pass is expected to additionally exercise this
 * with a real request.
 *
 * Read-only: this test only inspects apps/mercato's files, never modifies anything outside this
 * task's own owned paths (apps/dealer-portal/{app/(portal)/staff,components/staff,
 * lib/features/staff}).
 */

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const MODULE_DIR = join(TEST_DIR, '..', '..', 'mercato', 'src', 'modules', 'dealer_org_rbac')

function readMercatoFile(relativePath) {
  return readFileSync(join(MODULE_DIR, relativePath), 'utf8')
}

test('GET .../dealer/staff requires dealer_org.manage_staff (owner-only roster read)', () => {
  const source = readMercatoFile('api/dealer/staff/route.ts')
  assert.match(source, /GET:\s*\{\s*requireAuth:\s*true,\s*requireFeatures:\s*\[\s*['"]dealer_org\.manage_staff['"]\s*\]/)
})

test('POST .../dealer/staff/invite requires dealer_org.manage_staff', () => {
  const source = readMercatoFile('api/dealer/staff/invite/route.ts')
  assert.match(source, /POST:\s*\{\s*requireAuth:\s*true,\s*requireFeatures:\s*\[\s*['"]dealer_org\.manage_staff['"]\s*\]/)
})

test('POST .../dealer/staff/{id}/deactivate requires dealer_org.manage_staff', () => {
  const source = readMercatoFile('api/dealer/staff/[id]/deactivate/route.ts')
  assert.match(source, /POST:\s*\{\s*requireAuth:\s*true,\s*requireFeatures:\s*\[\s*['"]dealer_org\.manage_staff['"]\s*\]/)
})

test('setup.ts grants dealer:owner (but NOT dealer:staff) FEAT_DEALER_ORG_MANAGE_STAFF', () => {
  const source = readMercatoFile('setup.ts')
  const ownerBlock = source.match(/DEALER_OWNER_ROLE\]:\s*\[([^\]]*)\]/)
  assert.ok(ownerBlock, 'expected a DEALER_OWNER_ROLE entry in defaultRoleFeatures')
  assert.match(ownerBlock[1], /FEAT_DEALER_ORG_MANAGE_STAFF/)

  const staffBlock = source.match(/DEALER_STAFF_ROLE\]:\s*\[([^\]]*)\]/)
  assert.ok(staffBlock, 'expected a DEALER_STAFF_ROLE entry in defaultRoleFeatures')
  assert.doesNotMatch(staffBlock[1], /FEAT_DEALER_ORG_MANAGE_STAFF/)
})

test('executeStaffDeactivate rejects self-deactivation before touching the auth module', () => {
  const source = readMercatoFile('commands/staff.ts')
  assert.match(source, /callerUserId === parsed\.userId/)
  assert.match(source, /cannotDeactivateSelf/)
})

test('executeStaffDeactivate resolves its target via findDealerStaffUser, which only ever matches dealer:staff', () => {
  const commandSource = readMercatoFile('commands/staff.ts')
  assert.match(commandSource, /findDealerStaffUser\(/)

  const directorySource = readMercatoFile('lib/staffDirectory.ts')
  assert.match(directorySource, /roster\.find\(\(u\) => u\.id === userId && u\.role === DEALER_STAFF_ROLE\)/)
})

test('deactivation is performed through the installed auth.users.update command with isConfirmed:false, not a local flag', () => {
  const source = readMercatoFile('commands/staff.ts')
  assert.match(source, /commandBus\.execute\(\s*'auth\.users\.update'/)
  assert.match(source, /isConfirmed:\s*false/)
})

test('staff invite is created with the real dealer:staff role via the installed auth.users.create command', () => {
  const source = readMercatoFile('commands/staff.ts')
  assert.match(source, /commandBus\.execute<Record<string, unknown>, \{ id: string \}>\(\s*'auth\.users\.create'/)
  assert.match(source, /roles:\s*\[DEALER_STAFF_ROLE\]/)
})
