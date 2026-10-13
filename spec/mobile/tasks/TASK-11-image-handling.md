---
id: TASK-11
title: Image handling — expo-image everywhere, caching, placeholders, cart thumbnails
status: Not Started
---

# TASK-11 — Image handling (expo-image)

## Objective

Replace every raw React Native `Image` usage with `expo-image`, adding disk caching, blur/placeholder-while-loading, and graceful fallback when a URL is missing or fails — fixes the visibly broken-looking blank white product cards confirmed on a real device. Also adds a thumbnail to cart lines, which currently show no image at all even though the backend's cart response includes one (`CartLine.imageUrl`, already in the TASK-04 contract).

## Boundaries

**You own:**
- `src/components/ui/ProductImage.tsx` (new shared component — every image in the app goes through this, not raw `expo-image` calls scattered around)
- `src/features/catalog/components/ProductCard.tsx` (swap its image block for `ProductImage`)
- `src/features/catalog/screens/ProductDetailScreen.tsx` (swap its image block for `ProductImage`)
- `src/features/catalog/components/OccasionTile.tsx` (swap its image block for `ProductImage`)
- `src/features/cart/components/CartLineRow.tsx` (add a thumbnail using `ProductImage` — currently shows no image at all; `line.imageUrl` is already available on the `CartLine` type)

**Do not touch:** `src/theme/**` (TASK-10 owns it — import from it, don't duplicate), any other screen/component not listed above, `App.tsx`, `package.json`/`app.json` (list `expo-image` under Dependencies to add).

## Contracts consumed

From TASK-10 (frozen spec — code against this even before TASK-10's file lands): `theme.colors.surface` (placeholder background), `theme.radii.md` (corner rounding).

## Contracts produced

`src/components/ui/ProductImage.tsx`:
```ts
export interface ProductImageProps {
  uri?: string | null
  style?: StyleProp<ViewStyle>
  aspectRatio?: number   // default 1 (square) — ProductDetailScreen's hero image may want a different ratio
  accessibilityLabel?: string
}
export function ProductImage(props: ProductImageProps): JSX.Element
```
Behavior: when `uri` is set, renders `expo-image`'s `<Image>` with `cachePolicy="disk"`, a `placeholder` (use a blurhash-free solid-color placeholder — `theme.colors.surface` — is fine, no need to generate real blurhashes for this pass), and `transition={200}` for a fade-in. When `uri` is missing/null/empty, renders a themed placeholder box (same `theme.colors.surface` background, no broken-image icon needed — a plain colored box reads fine for a product with no photo yet) instead of blank white.

## Acceptance criteria

- No more blank/broken-looking white boxes where a product has no image — a consistent, intentional-looking placeholder shows instead.
- Images that do have a URL fade in smoothly rather than popping in abruptly.
- Revisiting a product/screen already viewed loads its image instantly from cache (no visible re-fetch flicker) — test by navigating away and back.
- Cart lines now show a small thumbnail next to the product title.
- `npx tsc --noEmit` passes with zero errors.

## Dependencies to add

```
expo-image
```

## Non-goals

- No image upload/editing — this is display-only.
- No real blurhash generation (the backend doesn't currently provide one) — a solid-color placeholder is sufficient for this pass.
