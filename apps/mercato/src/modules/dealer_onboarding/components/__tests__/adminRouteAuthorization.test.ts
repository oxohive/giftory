import { describe, expect, it } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Route-level authorization check for every admin endpoint this review
 * screen calls (list, detail, approve, reject, document download).
 *
 * This does NOT re-implement or weaken the gate — `dealer_onboarding/api/`
 * is outside this task's owned paths (owned by the lane that landed
 * TASK-02/TASK-03's backend work) and is read here, never edited. The
 * dispatcher (`apps/mercato/src/app/api/[...slug]/route.ts`, also outside
 * this task) enforces each route's exported `metadata.<METHOD>.
 * requireFeatures` via `rbacService.userHasAllFeatures(...)` BEFORE the
 * route handler ever runs — see API-CONTRACTS.md's "Conventions" section,
 * independently verified there against source. That shared enforcement
 * mechanism is exactly what makes "hiding a button" different from "being
 * unauthorized": even with every Approve/Reject/Download control visible,
 * a caller without `dealer_onboarding.admin` gets a real 403 from the
 * server, never a successful mutation or file byte.
 *
 * What this test proves, directly from the real deployed route files
 * (parsed as text — importing them would pull in the Next.js route runtime,
 * which this app's jest config does not set up, so parsing is the safe way
 * to assert on the real contract without executing server-framework code
 * from a UI-owned test): every one of the five routes this screen depends
 * on actually declares `requireFeatures: ['dealer_onboarding.admin']`, not
 * a weaker or missing gate the UI happens to not exercise. If any of these
 * files is ever edited to drop or weaken that declaration, this test fails
 * — a regression this screen's own owned-path tests can catch even though
 * the route files themselves are out of this task's edit scope.
 */

const API_ROOT = join(__dirname, '..', '..', 'api')

function readRoute(relativePath: string): string {
  return readFileSync(join(API_ROOT, relativePath), 'utf8')
}

/** Finds `<METHOD>: { ... requireFeatures: [...] ... }` and returns the array's contents. */
function requireFeaturesFor(source: string, method: 'GET' | 'POST'): string[] {
  const methodBlockMatch = source.match(new RegExp(`${method}:\\s*{([^}]*)}`))
  if (!methodBlockMatch) throw new Error(`No ${method} metadata block found`)
  const requireFeaturesMatch = methodBlockMatch[1].match(/requireFeatures:\s*\[([^\]]*)\]/)
  if (!requireFeaturesMatch) throw new Error(`No requireFeatures in ${method} metadata block`)
  return requireFeaturesMatch[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
}

describe('admin review routes all require dealer_onboarding.admin', () => {
  it('GET admin/dealers/applications (list)', () => {
    const source = readRoute('admin/dealers/applications/route.ts')
    expect(requireFeaturesFor(source, 'GET')).toEqual(['dealer_onboarding.admin'])
  })

  it('GET admin/dealers/applications/[id] (detail)', () => {
    const source = readRoute('admin/dealers/applications/[id]/route.ts')
    expect(requireFeaturesFor(source, 'GET')).toEqual(['dealer_onboarding.admin'])
  })

  it('POST admin/dealers/applications/[id]/approve', () => {
    const source = readRoute('admin/dealers/applications/[id]/approve/route.ts')
    expect(requireFeaturesFor(source, 'POST')).toEqual(['dealer_onboarding.admin'])
  })

  it('POST admin/dealers/applications/[id]/reject', () => {
    const source = readRoute('admin/dealers/applications/[id]/reject/route.ts')
    expect(requireFeaturesFor(source, 'POST')).toEqual(['dealer_onboarding.admin'])
  })

  it('GET admin/dealers/applications/[id]/documents/[documentId]/file (secure document download)', () => {
    const source = readRoute('admin/dealers/applications/[id]/documents/[documentId]/file/route.ts')
    expect(requireFeaturesFor(source, 'GET')).toEqual(['dealer_onboarding.admin'])
  })

  it('every route also requires authentication (requireAuth: true), not just the feature grant', () => {
    const routes = [
      'admin/dealers/applications/route.ts',
      'admin/dealers/applications/[id]/route.ts',
      'admin/dealers/applications/[id]/approve/route.ts',
      'admin/dealers/applications/[id]/reject/route.ts',
      'admin/dealers/applications/[id]/documents/[documentId]/file/route.ts',
    ]
    for (const route of routes) {
      const source = readRoute(route)
      expect(source).toMatch(/requireAuth:\s*true/)
    }
  })
})
