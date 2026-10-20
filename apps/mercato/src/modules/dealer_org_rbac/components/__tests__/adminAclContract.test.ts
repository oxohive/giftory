import { describe, expect, it } from '@jest/globals'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Reads the REAL route/setup source files (not a description of them) to
 * pin down exactly what this task's acceptance criteria can and cannot
 * claim about the admin dealer directory's permission model.
 *
 * Finding, verified directly from source: `GET /admin/dealers` (list),
 * `GET /admin/dealers/{id}` (detail), and `PUT /admin/dealers/{id}/
 * capabilities` (save) are ALL gated by the single feature
 * `dealer_org.admin` — there is no separate "view only" feature the way
 * `commissions`/`payouts` split `.view` from `.manage`. `setup.ts` grants
 * `dealer_org.admin` only to `superadmin`/`admin`; `employee` gets nothing
 * for this module's admin surface at all.
 *
 * Consequence for TASK-12's acceptance item ("an employee/read-only admin
 * role sees the directory but cannot save capability changes"): as
 * currently coded, an `employee` caller is denied ALL THREE routes with a
 * real server-side 403 — they cannot see the directory either, not just
 * the save action. This UI task's owned paths are `backend/`,
 * `components/`, `i18n/` only — `acl.ts`/`setup.ts` are out of scope to
 * change here (and were already "Verified working" / frozen by a prior
 * audit per API-CONTRACTS.md). This test exists so that reality, not the
 * literal acceptance wording, is what's asserted and locked in; see this
 * task's handoff for the explicit flag to the coordinator.
 */
const MODULE_ROOT = join(__dirname, '..', '..')

function readSource(relativePath: string): string {
  return readFileSync(join(MODULE_ROOT, relativePath), 'utf8')
}

describe('dealer_org_rbac admin ACL contract (read-only verification of real source)', () => {
  it('the admin dealers list route requires dealer_org.admin', () => {
    const source = readSource('api/admin/dealers/route.ts')
    expect(source).toMatch(/GET:\s*\{\s*requireAuth:\s*true,\s*requireFeatures:\s*\['dealer_org\.admin'\]/)
  })

  it('the admin dealer detail route requires dealer_org.admin', () => {
    const source = readSource('api/admin/dealers/[id]/route.ts')
    expect(source).toMatch(/GET:\s*\{\s*requireAuth:\s*true,\s*requireFeatures:\s*\['dealer_org\.admin'\]/)
  })

  it('the admin capabilities write route requires dealer_org.admin', () => {
    const source = readSource('api/admin/dealers/[id]/capabilities/route.ts')
    expect(source).toMatch(/PUT:\s*\{\s*requireAuth:\s*true,\s*requireFeatures:\s*\['dealer_org\.admin'\]/)
  })

  it('setup.ts grants dealer_org.admin only to superadmin/admin — employee gets nothing for this surface', () => {
    const source = readSource('setup.ts')
    // superadmin and admin both get FEAT_DEALER_ORG_ADMIN.
    expect(source).toMatch(/superadmin:\s*\[FEAT_DEALER_ORG_ADMIN\]/)
    expect(source).toMatch(/admin:\s*\[FEAT_DEALER_ORG_ADMIN\]/)
    // There is no `employee:` key at all in this module's defaultRoleFeatures.
    expect(source).not.toMatch(/\bemployee\s*:/)
    // Dealer-side roles only ever get the self-service view feature, never
    // the admin feature that gates this directory.
    expect(source).toMatch(/DEALER_OWNER_ROLE\]:\s*\[[\s\S]*?FEAT_DEALER_ORG_VIEW/)
    expect(source).not.toMatch(/DEALER_OWNER_ROLE\][\s\S]*?FEAT_DEALER_ORG_ADMIN/)
  })
})
