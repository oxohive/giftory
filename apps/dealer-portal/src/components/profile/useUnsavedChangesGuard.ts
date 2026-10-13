'use client'

import { useEffect } from 'react'
import { shouldInterceptNavigation } from '@/lib/features/profile/navigationGuard'

/**
 * "Don't let an owner navigate away and silently lose edits" (this task's own acceptance item).
 * Two independent mechanisms, both active only while `isDirty` is true:
 *
 * 1. A native `beforeunload` listener — the browser's own "leave site?" prompt — covers a tab
 *    close, a page refresh, or a typed/bookmarked URL navigation. This is the one case no amount
 *    of in-app click interception can cover.
 * 2. A capture-phase `click` listener on `document` — covers every in-app same-tab, same-origin
 *    anchor click application-wide (the `PortalNav` links, the "Back to profile" link, etc.)
 *    without this component needing to know about every link that could appear on the page.
 *    `shouldInterceptNavigation` (navigationGuard.ts) decides which clicks actually represent a
 *    real in-app navigation worth warning about; a cancelled confirm stops the click in the
 *    capture phase (`stopPropagation` + `preventDefault`) before Next's own `<Link>` click
 *    handler — attached in the bubble phase — ever runs, so a "Cancel" answer genuinely keeps
 *    the user on this page with their edits intact.
 *
 * Deliberately not unit-tested directly (no jsdom in this app's test setup — see
 * navigationGuard.ts's own note); the one piece of real decision logic here is pulled out into
 * that pure, tested function. This hook is the thin, DOM-touching wiring around it.
 */
export function useUnsavedChangesGuard(isDirty: boolean, message: string): void {
  useEffect(() => {
    if (!isDirty) return

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented) return
      const target = event.target as Element | null
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor) return

      const intercept = shouldInterceptNavigation(anchor.href, window.location.origin, anchor.target, {
        button: event.button,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      })
      if (!intercept) return

      if (!window.confirm(message)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('click', handleClick, true)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('click', handleClick, true)
    }
  }, [isDirty, message])
}
