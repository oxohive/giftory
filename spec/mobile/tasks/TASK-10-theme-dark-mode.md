---
id: TASK-10
title: Theme restructure — dark mode, type scale, elevation, brand font
status: Not Started
---

# TASK-10 — Theme restructure (dark mode, type scale, elevation, font)

## Objective

Restructure `src/theme/index.ts` from a single flat light palette into a scheme-aware theme (light + dark token sets, switching live with the OS), and extend it with the tokens every other design-wave task (TASK-11–15) needs: an expanded type scale, elevation/shadow tokens, icon-size tokens, and a brand font. This is the **foundational** task — every other task in this wave codes against the **frozen contract** below (exact new token names), so they can all run in parallel without waiting for this task's actual code to land.

## Boundaries

**You own:** `src/theme/index.ts` only.

**Hard constraint — do not break existing call sites:** every component in the app currently calls `useTheme()` and reads flat keys like `theme.colors.primary`, `theme.colors.text`, `theme.spacing(n)`, `theme.radii.md`, `theme.typography.heading`. **All of these must keep resolving to a sensible value after your change, unmodified at every call site.** `useTheme()` is already a hook (not a plain export), so making it scheme-aware is a pure internal change — no consumer needs to be touched. Do not rename or remove any existing top-level key.

## Contracts produced (frozen — every other TASK-1x task in this wave codes against these exact names)

```ts
// src/theme/index.ts
export interface ThemeColors {
  background: string; surface: string; text: string; textMuted: string
  primary: string; primaryText: string; border: string
  success: string; warning: string; danger: string
}

export interface Theme {
  colors: ThemeColors                 // scheme-aware — same keys as today, now resolved per light/dark
  spacing: (multiplier: number) => number
  radii: { sm: number; md: number; lg: number }
  typography: {
    display: TextStyle                // NEW — hero/large numbers (e.g. order total on Confirmation)
    heading: TextStyle
    subheading: TextStyle
    body: TextStyle
    caption: TextStyle
    small: TextStyle                  // NEW — finer than caption, e.g. legal/meta text
  }
  elevation: { sm: ViewStyle; md: ViewStyle; lg: ViewStyle }   // NEW — shadow (iOS) + elevation (Android) per level
  sizes: { icon: { sm: number; md: number; lg: number } }      // NEW — for Ionicons `size` props across the app
  isDark: boolean                     // NEW — for any component that needs to branch (e.g. StatusBar style)
}

export function useTheme(): Theme    // same signature as today — now reads useColorScheme() internally
export const theme: Theme             // keep this static export too (resolves to the LIGHT palette, for any
                                       // non-component/non-hook context that still imports `theme` directly —
                                       // grep for `from '../theme'` / `from '../../theme'` importing `theme`
                                       // itself rather than `useTheme` before removing it)
```

## Implementation notes

- Use `useColorScheme()` from `'react-native'` inside `useTheme()`. Treat `null`/`undefined` (scheme not yet determined) as light.
- Dark palette: invert background/surface/text sensibly (e.g. `background: '#121212'`, `surface: '#1E1E1E'`, `text: '#F2F2F2'`, `textMuted: '#A3A3A3'`, `border: '#2E2E2E'`) — keep `primary` (`#B3122E`, the brand red) identical in both modes unless it fails contrast against the dark background (check: does white text on `#B3122E` still read clearly on a dark surface? If fine, don't invent a second brand color).
- Font: use `expo-font` + a real typeface (e.g. load a Google Font via `@expo-google-fonts/*` — pick one that reads as warm/gift-appropriate, not a generic sans. Document your pick in a comment). Apply it as the `fontFamily` in every `typography.*` entry. Guard against the font not being loaded yet (App.tsx's root will need `useFonts()` + a loading gate — **do not edit `App.tsx` yourself**; instead export a `useThemeFonts()` hook or equivalent from this file that `App.tsx` can call, and note the exact one-line integration needed in your PR/commit message for manual merging, since `App.tsx` is a shared touch-point with TASK-12 and TASK-14 in this same wave).
- Elevation: `sm`/`md`/`lg` should each produce a working shadow on iOS (`shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius`) AND Android (`elevation`) — don't use a library, plain `ViewStyle` objects are sufficient.

## Acceptance criteria

- Toggling the OS between light/dark mode changes the app's colors live (no restart needed) when tested on a real device.
- `npx tsc --noEmit` passes with zero errors — confirms no consumer broke.
- Every existing screen still renders correctly (spot-check Home, Products, Cart, Account) — this task must not visually regress anything, only extend.

## Dependencies to add

```
expo-font
@expo-google-fonts/<your-chosen-family>   # pick one, name it in your commit
```

## Non-goals

- No manual in-app light/dark toggle UI — follow the OS setting only, for this pass.
- No per-screen redesign — this task only touches the theme file itself.
