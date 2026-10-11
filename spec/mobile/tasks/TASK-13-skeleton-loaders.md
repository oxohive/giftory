---
id: TASK-13
title: Skeleton loading states
status: Not Started
---

# TASK-13 — Skeleton loading states

## Objective

Replace the generic spinner (`LoadingState`) on data-heavy screens with skeleton placeholders shaped like the real content, and add a subtle in-place indicator for background refetches (e.g. after a filter change, now that TASK-14-era `placeholderData: keepPreviousData` means the screen shows stale data with no visible sign a refetch is happening).

## Boundaries

**You own:**
- `src/components/ui/Skeleton.tsx` (new — a base shimmering block primitive)
- `src/features/catalog/components/ProductCardSkeleton.tsx` (new — matches `ProductCard`'s layout)
- Targeted edits to these specific screens' loading branches only:
  - `src/features/catalog/screens/HomeScreen.tsx` — skeleton for the occasion-tile row while occasions load.
  - `src/features/catalog/screens/ProductListScreen.tsx` — skeleton grid (reuse `ProductCardSkeleton`) on first load; a small inline spinner/indicator near the "N results" text (not a full-screen takeover) while `isFetching` is true on a subsequent filter change.
  - `src/features/cart/screens/CartScreen.tsx` — skeleton line-items on first load.

**Do not touch:** `src/theme/**` (TASK-10 owns it), `App.tsx`, any screen not listed above, `package.json`/`app.json`.

## Contracts consumed

From TASK-10 (frozen spec): `theme.colors.surface`, `theme.colors.border`, `theme.radii.md`.

From TASK-11 (frozen spec, for `ProductCardSkeleton`'s image-block proportions only — do not import `ProductImage` itself, a skeleton doesn't load a real image): match the aspect ratio `ProductCard`/`ProductImage` uses so the skeleton-to-real-content transition doesn't jump.

## Contracts produced

`src/components/ui/Skeleton.tsx`:
```ts
export interface SkeletonProps {
  width?: number | `${number}%`
  height: number
  style?: StyleProp<ViewStyle>
  borderRadius?: number
}
export function Skeleton(props: SkeletonProps): JSX.Element
```
Implementation: a simple opacity-pulse animation (`Animated.loop` + `Animated.sequence`, plain RN Animated API — no new dependency needed) cycling between ~0.4 and ~1.0 opacity on a `theme.colors.border`-colored block. Good enough for this pass; doesn't need the shimmer-sweep effect a dedicated library would add.

## Acceptance criteria

- First load of Home/Products/Cart shows skeleton placeholders shaped like the real content, not a centered spinner.
- Changing a filter on Products no longer looks like "nothing is happening" — a small, non-intrusive indicator (e.g. next to "N results") shows while the new page fetches, and the OLD results stay visible and interactive until the new ones arrive (this builds on the `placeholderData: keepPreviousData` fix already committed to `useProducts.ts` — that part is done; this task adds the missing visible-indicator half).
- `npx tsc --noEmit` passes with zero errors.

## Dependencies to add

None — plain RN `Animated` API is sufficient.

## Non-goals

- No skeleton for Account/Orders/Checkout screens in this pass — those are lower-traffic, lower-priority surfaces; can be a fast-follow.
