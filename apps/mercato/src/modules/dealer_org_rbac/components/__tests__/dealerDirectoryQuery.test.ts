import { describe, expect, it } from '@jest/globals'
import { buildDealerDirectoryListParams } from '../dealerDirectoryQuery'

describe('buildDealerDirectoryListParams', () => {
  it('always includes page and pageSize', () => {
    expect(buildDealerDirectoryListParams({ page: 2, pageSize: 25 })).toEqual({ page: '2', pageSize: '25' })
  })

  it('includes search only when it carries a real, trimmed value', () => {
    expect(buildDealerDirectoryListParams({ page: 1, pageSize: 25, search: '  ' })).toEqual({ page: '1', pageSize: '25' })
    expect(buildDealerDirectoryListParams({ page: 1, pageSize: 25, search: '  Acme  ' })).toEqual({
      page: '1',
      pageSize: '25',
      search: 'Acme',
    })
  })

  it('includes state only when it carries a real, trimmed value', () => {
    expect(buildDealerDirectoryListParams({ page: 1, pageSize: 25, state: '' })).toEqual({ page: '1', pageSize: '25' })
    expect(buildDealerDirectoryListParams({ page: 1, pageSize: 25, state: 'MH' })).toEqual({
      page: '1',
      pageSize: '25',
      state: 'MH',
    })
  })

  it('never emits a kycStatus or product-type param — the real admin list route has no such query param', () => {
    // GET /api/dealer_org_rbac/admin/dealers always filters to kycStatus
    // 'approved' server-side (see ../../api/admin/dealers/route.ts's
    // listQuerySchema) and has no product-type filter of any kind. This
    // guards against a future edit reintroducing a filter this task was
    // explicitly told not to build without real server support.
    const params = buildDealerDirectoryListParams({
      page: 1,
      pageSize: 25,
      search: 'anything',
      state: 'DL',
    })
    expect(Object.keys(params).sort()).toEqual(['page', 'pageSize', 'search', 'state'])
  })
})
