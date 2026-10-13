---
id: TASK-12
title: Toast feedback + haptics
status: Not Started
---

# TASK-12 — Toast feedback + haptics

## Objective

Add lightweight, non-blocking feedback for actions that currently give the user no confirmation at all (add to cart, order placed) or only a full inline error block, plus haptic feedback on key interactions, so the app feels tactile and responsive instead of flat.

## Boundaries

**You own:**
- `src/components/ui/Toast.tsx` (provider + hook)
- `src/lib/haptics.ts` (thin wrapper around `expo-haptics`, so call sites say `haptics.light()`/`haptics.success()`/`haptics.error()` instead of importing `expo-haptics` directly everywhere)
- Small, targeted edits to wire toasts into these **specific** existing call sites only (do not refactor anything else in these files):
  - `src/features/cart/hooks/useCart.ts` — fire a success toast ("Added to cart") after `addLine` resolves; fire an error toast on any mutation failure, in addition to whatever error handling already exists there (don't remove existing error UI, this is additive).
  - `src/features/checkout/screens/ConfirmationScreen.tsx` — fire a success toast + `haptics.success()` on mount when an order is confirmed.
  - `src/components/ui/Button.tsx` — add `haptics.light()` on every press (via `onPress` wrapper), regardless of variant.

**Do not touch:** `App.tsx` directly. You need a `<ToastProvider>` mounted near the root — instead of editing `App.tsx` yourself (shared touch-point with TASK-10 and TASK-14 in this same wave), export the provider component and state the exact one-line JSX wrapping needed in your PR/commit message for manual integration afterward.

**Do not touch:** `src/theme/**`, `src/features/catalog/**`, `src/features/account/**`, `src/features/orders/**`, any file not explicitly listed above.

## Contracts consumed

From TASK-10 (frozen spec): `theme.colors.success`, `theme.colors.danger`, `theme.colors.surface`, `theme.radii.md`, `theme.elevation.md`.

## Contracts produced

`src/components/ui/Toast.tsx`:
```ts
export function ToastProvider(props: { children: React.ReactNode }): JSX.Element
export function useToast(): {
  show: (message: string, variant?: 'success' | 'error' | 'info') => void
}
```

`src/lib/haptics.ts`:
```ts
export const haptics: {
  light: () => void      // button presses
  success: () => void    // order confirmed, item added
  error: () => void      // a mutation failed
}
```

## Acceptance criteria

- Adding an item to cart from Product Detail shows a brief toast ("Added to cart") without navigating away or blocking the screen.
- Placing an order successfully triggers both a success toast and a haptic tap on the Confirmation screen.
- Every button press gives a subtle haptic tap (test on a real device — haptics don't work in Expo Go on some older devices, note this in your report if you can't verify it directly).
- A toast auto-dismisses after ~3 seconds and doesn't stack indefinitely if multiple fire quickly (cap visible toasts at 1, replacing the previous one).
- `npx tsc --noEmit` passes with zero errors.

## Dependencies to add

```
expo-haptics
```
(no toast library needed — build the toast component directly, it's simple enough not to warrant a dependency)

## Non-goals

- No toast queue/history — fire-and-forget, single visible toast at a time is sufficient.
- No sound effects, haptics only.
