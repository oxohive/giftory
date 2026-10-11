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
  radii: { sm: number; md: number; lg: number }
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

const lightColors: ThemeColors = {
  background: '#FFFFFF',
  surface: '#F7F5F2',
  text: '#1A1A1A',
  textMuted: '#6B6B6B',
  primary: '#B3122E',
  primaryText: '#FFFFFF',
  border: '#E2DED8',
  success: '#1E7F3C',
  warning: '#B8860B',
  danger: '#C0392B',
}

// Dark palette: background/surface/text/textMuted/border inverted sensibly.
// `primary` (brand red) is kept identical — white `primaryText` on `#B3122E`
// still reads clearly against the dark surface, so no second brand color is
// needed. success/warning/danger are also kept as-is; they already have
// enough contrast against the dark background/surface values below.
const darkColors: ThemeColors = {
  background: '#121212',
  surface: '#1E1E1E',
  text: '#F2F2F2',
  textMuted: '#A3A3A3',
  primary: '#B3122E',
  primaryText: '#FFFFFF',
  border: '#2E2E2E',
  success: '#1E7F3C',
  warning: '#B8860B',
  danger: '#C0392B',
}

// spacing(1) === 8px base unit, e.g. spacing(2) => 16
const spacing = (multiplier: number): number => multiplier * 8

const radii = {
  sm: 4,
  md: 8,
  lg: 16,
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
