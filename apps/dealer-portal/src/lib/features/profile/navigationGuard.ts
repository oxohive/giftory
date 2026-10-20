/**
 * Pure decision logic behind the capabilities form's unsaved-changes guard
 * (components/profile/useUnsavedChangesGuard.ts). Split out so the "should this particular click
 * actually be intercepted" question is unit-testable (tests/profile-navigation-guard.test.mjs)
 * without mounting a component or touching the DOM — no jsdom is configured anywhere in this
 * app's test setup (plain `node --test`, confirmed against every existing *.test.mjs in
 * tests/), so any logic that can be pulled out of the DOM-touching hook and expressed as a pure
 * function belongs here, not there.
 *
 * The guard itself (the hook) additionally registers a native `beforeunload` handler while the
 * form is dirty — that covers a tab close/refresh/typed-URL navigation with the browser's own
 * "leave site?" prompt, which needs no decision logic of its own (the browser always shows it
 * once `preventDefault()` is called) and therefore has nothing to unit-test here.
 */

export interface ClickModifiers {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/**
 * Should a click on this anchor be intercepted (i.e. is it a plain, same-tab, same-origin,
 * in-app navigation the SPA router would otherwise handle)? `false` lets the browser do whatever
 * it would normally do — a modified click (ctrl/cmd/shift/middle-click, opening in a new tab),
 * a `target="_blank"` link, or a link to a different origin are all left alone: none of them
 * discard the current tab's unsaved state, so warning on them would be a false alarm.
 */
export function shouldInterceptNavigation(
  href: string,
  currentOrigin: string,
  target: string | null | undefined,
  modifiers: ClickModifiers,
): boolean {
  if (modifiers.button !== 0) return false
  if (modifiers.metaKey || modifiers.ctrlKey || modifiers.shiftKey || modifiers.altKey) return false
  if (target && target !== '_self') return false
  let url: URL
  try {
    url = new URL(href, currentOrigin)
  } catch {
    return false
  }
  if (url.origin !== currentOrigin) return false
  return true
}
