import { useColorScheme } from 'react-native'
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
  text: string
  textMuted: string
  primary: string
  primaryText: string
  border: string
  success: string
  warning: string
  danger: string
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
  }
  elevation: { sm: ViewStyle; md: ViewStyle; lg: ViewStyle }
  sizes: { icon: { sm: number; md: number; lg: number } }
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
  text: '#1A1A1A',
  textMuted: '#6E645D',
  primary: '#B3122E',
  primaryText: '#FFFFFF',
  border: '#ECE3D8',
  success: '#1E7F3C',
  warning: '#B8860B',
  danger: '#C0392B',
}

// Dark palette: a deep maroon-black canvas (not neutral gray) to keep the
// same warm "atelier" identity after dark, with a lighter warm-dark surface
// for cards. `primary` brightens to `#E8536C` since the base brand red loses
// contrast against a near-black background; `primaryText` stays white.
const darkColors: ThemeColors = {
  background: '#170E10',
  surface: '#241619',
  text: '#F6E9E6',
  textMuted: '#C9A9A2',
  primary: '#E8536C',
  primaryText: '#FFFFFF',
  border: '#3A2228',
  success: '#5FBF7F',
  warning: '#D4A556',
  danger: '#E2574C',
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
