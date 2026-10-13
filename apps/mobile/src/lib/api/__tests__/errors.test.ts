import { ApiError, classifyApiError } from '../errors'

describe('classifyApiError', () => {
  it('classifies a 5xx ApiError as "server"', () => {
    const err = new ApiError('Internal error', { code: 'INTERNAL', status: 500 })
    const result = classifyApiError(err)
    expect(result.kind).toBe('server')
  })

  it('classifies a status-0 ApiError as "server"', () => {
    const err = new ApiError('Unknown', { code: 'UNKNOWN', status: 0 })
    expect(classifyApiError(err).kind).toBe('server')
  })

  it('classifies a 4xx ApiError as "validation" and preserves its message', () => {
    const err = new ApiError('That item is out of stock', { code: 'OUT_OF_STOCK', status: 409 })
    const result = classifyApiError(err)
    expect(result.kind).toBe('validation')
    expect(result.message).toBe('That item is out of stock')
  })

  it('classifies a plain Error (not an ApiError) as "network"', () => {
    const result = classifyApiError(new Error('fetch failed'))
    expect(result.kind).toBe('network')
  })

  it('classifies a non-Error, non-ApiError value as "network"', () => {
    const result = classifyApiError('some string')
    expect(result.kind).toBe('network')
  })

  it('ApiError carries its code, status, and details', () => {
    const err = new ApiError('Bad request', { code: 'BAD_REQUEST', status: 400, details: { field: 'email' } })
    expect(err.code).toBe('BAD_REQUEST')
    expect(err.status).toBe(400)
    expect(err.details).toEqual({ field: 'email' })
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ApiError)
  })
})
