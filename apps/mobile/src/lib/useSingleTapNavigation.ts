import { useRef } from 'react'

const GUARD_WINDOW_MS = 600

/**
 * Prevents duplicate navigation from rapid repeated taps (checklist section
 * 2). Wrap any `onPress` that calls `navigation.navigate`/`push`/`replace`
 * with the returned `guard()` — a second tap within `GUARD_WINDOW_MS` of the
 * first is silently ignored instead of pushing a duplicate screen.
 *
 * Deliberately a time-window guard, not a "disable until this screen
 * unmounts" guard — React Navigation already keeps the previous screen
 * mounted during a push transition, so a `disabled` flag tied to component
 * state wouldn't reset at the right time; a simple timestamp check needs no
 * re-render and resets itself.
 */
export function useSingleTapNavigation(): {
  guard: <Args extends unknown[]>(fn: (...args: Args) => void) => (...args: Args) => void
} {
  const lastFireRef = useRef(0)

  function guard<Args extends unknown[]>(fn: (...args: Args) => void): (...args: Args) => void {
    return (...args: Args) => {
      const now = Date.now()
      if (now - lastFireRef.current < GUARD_WINDOW_MS) return
      lastFireRef.current = now
      fn(...args)
    }
  }

  return { guard }
}
