import { renderHook } from '@testing-library/react-native'
import { useSingleTapNavigation } from '../useSingleTapNavigation'

describe('useSingleTapNavigation', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('invokes the wrapped function once when the guarded call fires twice rapidly', () => {
    const { result } = renderHook(() => useSingleTapNavigation())
    const fn = jest.fn()
    const guarded = result.current.guard(fn)

    guarded()
    guarded()

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('allows a second call through once the guard window has elapsed', () => {
    const { result } = renderHook(() => useSingleTapNavigation())
    const fn = jest.fn()
    const guarded = result.current.guard(fn)

    guarded()
    expect(fn).toHaveBeenCalledTimes(1)

    // Guard window is 600ms — advance just past it.
    jest.advanceTimersByTime(601)

    guarded()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('still ignores a call made just under the guard window', () => {
    const { result } = renderHook(() => useSingleTapNavigation())
    const fn = jest.fn()
    const guarded = result.current.guard(fn)

    guarded()
    jest.advanceTimersByTime(300)
    guarded()

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('forwards arguments to the wrapped function', () => {
    const { result } = renderHook(() => useSingleTapNavigation())
    const fn = jest.fn()
    const guarded = result.current.guard(fn)

    guarded('Product', { id: '123' })

    expect(fn).toHaveBeenCalledWith('Product', { id: '123' })
  })
})
