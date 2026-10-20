import { describe, expect, it } from '@jest/globals'
import { buildRulesListParams } from '../rulesQuery'

/**
 * API-CONTRACTS.md documents a real backend bug: `activeOnly` is parsed
 * with `z.coerce.boolean().default(true)`, which runs JS `Boolean(value)`
 * on the query string — any non-empty string, including the literal text
 * `"false"`, coerces to `true`. Sending `activeOnly=false` therefore still
 * filters to active-only rules, the opposite of what the admin asked for.
 * The only value that actually disables the filter is an EMPTY string
 * (`activeOnly=`). This test locks in the one correct encoding so no
 * future edit silently reintroduces `activeOnly: 'false'`.
 */
describe('buildRulesListParams — the activeOnly footgun', () => {
  it('omits "activeOnly" entirely when not showing deactivated rules (server default is active-only)', () => {
    const params = buildRulesListParams({ page: 1, pageSize: 25, includeDeactivated: false })
    expect(params).not.toHaveProperty('activeOnly')
  })

  it('sends an EMPTY string — never the literal text "false" — when showing deactivated rules too', () => {
    const params = buildRulesListParams({ page: 1, pageSize: 25, includeDeactivated: true })
    expect(params.activeOnly).toBe('')
    expect(params.activeOnly).not.toBe('false')
  })

  it('reproduces, as documentation, why the naive encoding is wrong: Boolean("false") is true', () => {
    // This is the exact bug the backend has — asserted here so the
    // reasoning behind this module's behavior stays verifiable in CI.
    expect(Boolean('false')).toBe(true)
    expect(Boolean('')).toBe(false)
  })

  it('includes page and pageSize as plain decimal strings', () => {
    const params = buildRulesListParams({ page: 3, pageSize: 50, includeDeactivated: false })
    expect(params.page).toBe('3')
    expect(params.pageSize).toBe('50')
  })

  it('includes dealerProfileId and productTypeCode only when provided', () => {
    const withFilters = buildRulesListParams({
      page: 1,
      pageSize: 25,
      includeDeactivated: false,
      dealerProfileId: 'dealer-1',
      productTypeCode: 'mugs',
    })
    expect(withFilters.dealerProfileId).toBe('dealer-1')
    expect(withFilters.productTypeCode).toBe('mugs')

    const withoutFilters = buildRulesListParams({ page: 1, pageSize: 25, includeDeactivated: false })
    expect(withoutFilters).not.toHaveProperty('dealerProfileId')
    expect(withoutFilters).not.toHaveProperty('productTypeCode')
  })
})
