---
id: TASK-14
title: Bottom sheet for product filters
status: Not Started
---

# TASK-14 — Bottom sheet for product filters

## Objective

Convert the Products screen's filter UI from an always-expanded inline block (currently pushing all product results ~1200px down the screen, confirmed on a real device as the first thing visible on the whole screen) into a native bottom-sheet pattern triggered by a "Filters" button — the standard e-commerce UX, and a major reduction in scroll distance to actually see products.

## Boundaries

**You own:**
- `src/features/catalog/components/ProductFiltersSheet.tsx` (new — the bottom-sheet content, built from the existing filter controls currently inline in `ProductFiltersSheet`'s predecessor)
- `src/features/catalog/components/ProductFilters.tsx` (reduce this to a compact filter-summary bar: a "Filters" button showing an active-filter count badge, plus the search box and sort control can stay visible inline since those are used most often — category/occasion/recipient/price/gift-only move into the sheet)
- `src/features/catalog/screens/ProductListScreen.tsx` — wire up opening/closing the sheet, pass the same `value`/`onChange` props through

**Do not touch:** `App.tsx` directly. `@gorhom/bottom-sheet` requires `<GestureHandlerRootView>` (from `react-native-gesture-handler`, likely needs adding as a dependency too — check if it's already present as a transitive dep of React Navigation first) wrapping the app root, and a `<BottomSheetModalProvider>`. Instead of editing `App.tsx` yourself (shared touch-point with TASK-10 and TASK-12 in this same wave), state the exact JSX wrapping needed in your PR/commit message for manual integration afterward.

**Do not touch:** `src/theme/**`, `src/lib/api/**`, any screen other than `ProductListScreen.tsx`.

## Contracts consumed

From TASK-10 (frozen spec): `theme.colors.surface`, `theme.colors.border`, `theme.radii.lg` (sheets typically use a larger radius on the top corners), `theme.elevation.lg`.

The existing `ProductFilters`/`ProductListScreen` prop contract (already landed, read the real files — not a frozen spec, this already exists):
```ts
// current ProductFilters props — your ProductFiltersSheet should accept the same value/onChange shape
{ value: FilterState; onChange: (next: FilterState) => void; categories: Category[]; occasions: Occasion[] }
```

## Acceptance criteria

- Products screen shows results with at most ~2 lines of UI above them (search bar + a "Filters (N active)" button + sort), not the full filter panel.
- Tapping "Filters" opens a bottom sheet with all the controls that used to be inline (category, occasion, recipient, price range, gift-ready-only) — same functionality, same `onChange` behavior, just relocated.
- The sheet can be dismissed by swiping down or tapping outside, same as any native bottom sheet.
- An active-filter count badge on the "Filters" button reflects how many non-default filters are set.
- `npx tsc --noEmit` passes with zero errors.

## Dependencies to add

```
@gorhom/bottom-sheet
react-native-gesture-handler   # only if not already present — check first
react-native-reanimated        # only if not already present — check first, React Navigation may already pull this in
```

## Non-goals

- No redesign of the individual filter controls themselves (chips, price inputs) — same controls, new container.
- Sort control and search box stay inline on the main screen, not moved into the sheet (they're used more frequently and don't need to be hidden behind a tap).
