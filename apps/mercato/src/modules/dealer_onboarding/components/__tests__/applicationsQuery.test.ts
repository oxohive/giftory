import { describe, expect, it } from '@jest/globals'
import { buildApplicationsListParams } from '../applicationsQuery'

describe('buildApplicationsListParams', () => {
  it('always sends page and pageSize as plain decimal strings', () => {
    const params = buildApplicationsListParams({ page: 2, pageSize: 25 })
    expect(params.page).toBe('2')
    expect(params.pageSize).toBe('25')
  })

  it('omits kycStatus when not filtering by status', () => {
    const params = buildApplicationsListParams({ page: 1, pageSize: 25, kycStatus: '' })
    expect(params).not.toHaveProperty('kycStatus')
  })

  it('includes kycStatus when a status filter is selected', () => {
    const params = buildApplicationsListParams({ page: 1, pageSize: 25, kycStatus: 'under_review' })
    expect(params.kycStatus).toBe('under_review')
  })

  it('omits search when empty or only whitespace', () => {
    expect(buildApplicationsListParams({ page: 1, pageSize: 25, search: '' })).not.toHaveProperty('search')
    expect(buildApplicationsListParams({ page: 1, pageSize: 25, search: '   ' })).not.toHaveProperty('search')
  })

  it('trims and includes a real search term', () => {
    const params = buildApplicationsListParams({ page: 1, pageSize: 25, search: '  Acme Gifts  ' })
    expect(params.search).toBe('Acme Gifts')
  })

  it('includes sortField/sortDir only when provided, matching the server-accepted enum', () => {
    const withSort = buildApplicationsListParams({ page: 1, pageSize: 25, sortField: 'business_name', sortDir: 'asc' })
    expect(withSort.sortField).toBe('business_name')
    expect(withSort.sortDir).toBe('asc')

    const withoutSort = buildApplicationsListParams({ page: 1, pageSize: 25 })
    expect(withoutSort).not.toHaveProperty('sortField')
    expect(withoutSort).not.toHaveProperty('sortDir')
  })
})
