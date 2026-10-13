import { Platform, useColorScheme } from 'react-native'
import type { TextStyle, ViewStyle } from 'react-native'
import {
  useFonts,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito'

/**
 * Shared design tokens for the Giftory mobile app.
 *
 * Scheme-aware: `useTheme()` reads `useColorScheme()` from react-native and
 * resolves the light or dark color set live, so the app re-colors itself the
 * instant the OS appearance setting changes — no restart needed. Everything
 * else (spacing, radii, typography, elevation, icon sizes) is scheme-
 * independent and shared between both palettes.
 *
 * Brand font: Nunito (via @expo-google-fonts/nunito). Chosen over a generic
 * system sans because its rounded terminals and soft weight read as warm and
 * friendly — appropriate for a gift marketplace — while still staying highly
 * legible at small body/caption sizes (unlike a display serif, which would
 * hurt readability if applied everywhere typography.* is used). Fonts must
 * be loaded with `useFonts()` before the app renders; see `useThemeFonts()`
 * below, which `App.tsx` calls to gate rendering until the font is ready.
 */

export interface ThemeColors {
  background: string
  surface: string
  /** Card fill. Equal to `surface` in this palette (cards ARE the lifted-white
   * surface) — a distinct semantic name so components can say "card" without
   * caring that it happens to share a value with `surface` today. */
  card: string
  text: string
  textMuted: string
  primary: string
  primaryText: string
  /** Secondary brand accent — deep plum-gray, used for secondary CTAs/tags. */
  secondary: string
  secondaryText: string
  /** Decorative accent — warm gold, used for gift-wrap/premium accents. */
  accent: string
  accentText: string
  border: string
  success: string
  warning: string
  /** Inline/validation error color (form field errors, error text). */
  danger: string
  /** Informational (neutral, non-error) color — distinct hue from primary/success/danger. */
  info: string
  infoText: string
  /** Destructive ACTION color (buttons/menu items that delete or remove), as
   * opposed to `danger` which is for error/validation text. Same hue as
   * `danger` by design — both read as "stop/caution" — but modeled as a
   * separate token so a destructive button's color isn't accidentally tied
   * to unrelated error-copy styling. */
  destructive: string
  destructiveText: string
  /** Pressed-state overlay, laid on top of any pressable surface. */
  pressedOverlay: string
  /** Focused-field border/ring color. */
  focusRing: string
  /** Selected chip/option background + its foreground text/icon color. */
  selectedBackground: string
  selectedText: string
  /** Disabled control background + its foreground text/icon color. */
  disabledBackground: string
  disabledText: string
  /** Skeleton/placeholder fill while content loads. */
  loadingSkeleton: string
  /** Scrim behind a modal/bottom-sheet/overlay. */
  overlay: string
  /** Bottom tab bar background. Deliberately the same deep near-black tone
   * in both palettes (an "atelier" design choice, not theme-reactive) —
   * named here instead of hardcoded in `RootTabNavigator.tsx` so it's not a
   * stray hex value living outside the token file. */
  navBarBackground: string
  /** Inactive tab icon/label color against `navBarBackground`. */
  navBarInactive: string
  /** Active tab's sliding indicator "dot" background, against `navBarBackground`. */
  navBarActiveDot: string
}

export interface Theme {
  colors: ThemeColors
  spacing: (multiplier: number) => number
  radii: { sm: number; md: number; lg: number; xl: number; pill: number }
  typography: {
    display: TextStyle
    heading: TextStyle
    subheading: TextStyle
    body: TextStyle
    caption: TextStyle
    small: TextStyle
    /** Button label text — bold, slightly letter-spaced for legibility at
     * small sizes on a colored background. */
    button: TextStyle
    /** Field labels, chip labels, overline-style text. */
    label: TextStyle
  }
  elevation: { sm: ViewStyle; md: ViewStyle; lg: ViewStyle }
  sizes: { icon: { sm: number; md: number; lg: number } }
  /** Minimum comfortable touch-target size per platform (Apple HIG / Material
   * Design guidance: 44pt iOS, 48dp Android). Every pressable control should
   * have at least `touchTarget.min` width/height. */
  touchTarget: { ios: number; android: number; min: number }
  /** Standard animation/transition durations (ms), shared so motion feels
   * consistent instead of every component inventing its own timing. */
  motion: { fast: number; base: number; slow: number }
  isDark: boolean
}

// Warm ivory canvas with white, shadow-lifted cards — the "atelier" palette
// from the commissioned design mockups (Supporting-document/GIFTORY.zip).
// Deliberately inverted from a flat-UI default: `background` carries the
// cream tint, `surface` (cards/sheets) is bright white so every card reads
// as lifted off the page rather than blending into it.
const lightColors: ThemeColors = {
  background: '#FBF7F1',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  text: '#1A1A1A',
  textMuted: '#6E645D',
  primary: '#B3122E',
  primaryText: '#FFFFFF',
  secondary: '#4A3F55',
  secondaryText: '#FFFFFF',
  accent: '#C98A2B',
  accentText: '#1A1A1A',
  border: '#ECE3D8',
  success: '#1E7F3C',
  warning: '#B8860B',
  danger: '#C0392B',
  info: '#2E6FD9',
  infoText: '#FFFFFF',
  destructive: '#C0392B',
  destructiveText: '#FFFFFF',
  pressedOverlay: 'rgba(26, 26, 26, 0.06)',
  focusRing: '#2E6FD9',
  selectedBackground: '#F6E3C8',
  selectedText: '#8A5A14',
  disabledBackground: '#ECE3D8',
  disabledText: '#A89C8F',
  loadingSkeleton: '#ECE3D8',
  navBarBackground: '#201218',
  navBarInactive: 'rgba(255,255,255,0.55)',
  navBarActiveDot: '#FFFFFF',
  overlay: 'rgba(23, 14, 16, 0.4)',
}

// Dark palette: a deep maroon-black canvas (not neutral gray) to keep the
// same warm "atelier" identity after dark, with a lighter warm-dark surface
// for cards. `primary` brightens to `#E8536C` since the base brand red loses
// contrast against a near-black background; `primaryText` stays white.
const darkColors: ThemeColors = {
  background: '#170E10',
  surface: '#241619',
  card: '#241619',
  text: '#F6E9E6',
  textMuted: '#C9A9A2',
  primary: '#E8536C',
  primaryText: '#FFFFFF',
  secondary: '#CBB8D6',
  secondaryText: '#1A1A1A',
  accent: '#E0AE5C',
  accentText: '#1A1A1A',
  border: '#3A2228',
  success: '#5FBF7F',
  warning: '#D4A556',
  danger: '#E2574C',
  info: '#6FA0F0',
  infoText: '#0B1B33',
  destructive: '#E2574C',
  destructiveText: '#1A0604',
  pressedOverlay: 'rgba(246, 233, 230, 0.08)',
  focusRing: '#6FA0F0',
  selectedBackground: '#3A2A12',
  selectedText: '#E0AE5C',
  disabledBackground: '#2E2023',
  disabledText: '#6E5A5C',
  loadingSkeleton: '#2E2023',
  navBarBackground: '#2E1C22',
  navBarInactive: 'rgba(255,255,255,0.55)',
  navBarActiveDot: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.6)',
}

// spacing(1) === 8px base unit, e.g. spacing(2) => 16
const spacing = (multiplier: number): number => multiplier * 8

const radii = {
  sm: 4,
  md: 8,
  lg: 16,
  xl: 28,
  pill: 999,
}

// Font family names registered by `useFonts()` in `useThemeFonts()` below.
// These string literals must match the keys passed to `useFonts()` exactly.
const FONT_REGULAR = 'Nunito_400Regular'
const FONT_SEMIBOLD = 'Nunito_600SemiBold'
const FONT_BOLD = 'Nunito_700Bold'
const FONT_EXTRABOLD = 'Nunito_800ExtraBold'

const typography = {
  display: {
    fontFamily: FONT_EXTRABOLD,
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 40,
  } as TextStyle,
  heading: {
    fontFamily: FONT_BOLD,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
  } as TextStyle,
  subheading: {
    fontFamily: FONT_SEMIBOLD,
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
  } as TextStyle,
  body: {
    fontFamily: FONT_REGULAR,
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
  } as TextStyle,
  caption: {
    fontFamily: FONT_REGULAR,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  } as TextStyle,
  small: {
    fontFamily: FONT_REGULAR,
    fontSize: 10,
    fontWeight: '400',
    lineHeight: 14,
  } as TextStyle,
  button: {
    fontFamily: FONT_BOLD,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    letterSpacing: 0.2,
  } as TextStyle,
  label: {
    fontFamily: FONT_SEMIBOLD,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    letterSpacing: 0.3,
  } as TextStyle,
}

// 44pt (iOS) / 48dp (Android) per Apple HIG / Material Design — the minimum
// comfortable touch-target size. `min` is whichever this platform needs, so
// a component can write one `minWidth/minHeight: theme.touchTarget.min`
// instead of branching on `Platform.OS` itself.
const touchTarget = {
  ios: 44,
  android: 48,
  min: Platform.OS === 'ios' ? 44 : 48,
}

// Shared animation/transition durations (ms). Reuse these instead of each
// component inventing its own timing, so motion feels like one system.
const motion = {
  fast: 150,
  base: 220,
  slow: 320,
}

// Plain ViewStyle objects — shadow* for iOS, elevation for Android. No
// shadow library needed; both properties can coexist on the same style.
const elevation = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  } as ViewStyle,
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  } as ViewStyle,
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  } as ViewStyle,
}

const sizes = {
  icon: {
    sm: 16,
    md: 24,
    lg: 32,
  },
}

/**
 * Accessor hook for theme tokens. Reads the OS color scheme live via
 * `useColorScheme()` and resolves the light or dark palette accordingly —
 * `null`/`undefined` (scheme not yet determined) is treated as light.
 * Every existing top-level key (colors, spacing, radii, typography.heading,
 * etc.) keeps resolving exactly as before; this is a pure extension.
 */
export function useTheme(): Theme {
  const scheme = useColorScheme()
  const isDark = scheme === 'dark'
  return {
    colors: isDark ? darkColors : lightColors,
    spacing,
    radii,
    typography,
    elevation,
    sizes,
    touchTarget,
    motion,
    isDark,
  }
}

/**
 * Static theme export resolving to the LIGHT palette, for any
 * non-component/non-hook context that still imports `theme` directly
 * (e.g. `src/navigation/RootTabNavigator.tsx`) rather than calling
 * `useTheme()`.
 */
export const theme: Theme = {
  colors: lightColors,
  spacing,
  radii,
  typography,
  elevation,
  sizes,
  touchTarget,
  motion,
  isDark: false,
}

/**
 * Loads the brand font (Nunito, all weights used by `typography.*`).
 * `App.tsx` must call this at the root and gate rendering until
 * `fontsLoaded` is true — see the integration snippet in this task's report.
 */
export function useThemeFonts(): { fontsLoaded: boolean } {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  })
  return { fontsLoaded }
}
