import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * Tracks the OS "Reduce Motion" accessibility setting live. Any component
 * that animates (Skeleton shimmer, Toast fade, custom transitions) should
 * check this and skip/shorten its animation when `true`, per checklist
 * section 10 ("respect reduced-motion settings").
 *
 * Starts `false` (full motion) until the native call resolves, then updates
 * and keeps listening for changes made mid-session.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    let mounted = true

    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduced(value)
      })
      .catch(() => {
        // Platform doesn't support the query — assume full motion.
      })

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value: boolean) => {
      setReduced(value)
    })

    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  return reduced
}
