import { describe, expect, it } from '@jest/globals'
import { assignmentListQuerySchema } from '../data/validators'

/**
 * TASK-09 needs server-side deadline (`requiredBy`) sorting across the WHOLE
 * result set, not a client-side sort of one already-paginated page — see
 * `api/dealer/orders/route.ts`, which feeds this parsed query straight into
 * `em.findAndCount`'s `orderBy` (DB-level sort-then-paginate, never the
 * reverse). This test locks down the query contract those routes rely on.
 */
describe('assignmentListQuerySchema — server-side sorting contract', () => {
  it('defaults to assignedAt DESC (unchanged existing behavior)', () => {
    const result = assignmentListQuerySchema.parse({})
    expect(result.sortField).toBe('assignedAt')
    expect(result.sortDir).toBe('desc')
  })

  it('accepts requiredBy (the production deadline) as a sort field', () => {
    const result = assignmentListQuerySchema.parse({ sortField: 'requiredBy', sortDir: 'asc' })
    expect(result.sortField).toBe('requiredBy')
    expect(result.sortDir).toBe('asc')
  })

  it('rejects an unknown sort field rather than silently falling back', () => {
    expect(assignmentListQuerySchema.safeParse({ sortField: 'subtotal' }).success).toBe(false)
  })

  it('rejects an unknown sort direction', () => {
    expect(assignmentListQuerySchema.safeParse({ sortDir: 'sideways' }).success).toBe(false)
  })
})
