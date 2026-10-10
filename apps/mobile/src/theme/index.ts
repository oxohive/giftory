import type { TextStyle } from 'react-native'

/**
 * Shared design tokens for the Giftory mobile app.
 *
 * v1 ships a single light theme. The shape is kept flat (no `light`/`dark`
 * nesting) deliberately, but every value lives behind `theme`/`useTheme()`
 * so a future dark variant can be introduced by swapping the object (or by
 * making `useTheme()` read from a color-scheme-aware source) without
 * touching any component that consumes it.
 */
export const theme = {
  colors: {
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
  },
  // spacing(1) === 8px base unit, e.g. spacing(2) => 16
  spacing: (multiplier: number): number => multiplier * 8,
  radii: {
    sm: 4,
    md: 8,
    lg: 16,
  },
  typography: {
    heading: {
      fontSize: 24,
      fontWeight: '700',
      lineHeight: 30,
    } as TextStyle,
    subheading: {
      fontSize: 18,
      fontWeight: '600',
      lineHeight: 24,
    } as TextStyle,
    body: {
      fontSize: 15,
      fontWeight: '400',
      lineHeight: 22,
    } as TextStyle,
    caption: {
      fontSize: 12,
      fontWeight: '400',
      lineHeight: 16,
    } as TextStyle,
  },
}

/**
 * Accessor hook for theme tokens. Returns the single light theme today;
 * kept as a hook (rather than a plain export) so screens/components can
 * switch to a context-driven theme (e.g. dark mode) later without changing
 * call sites.
 */
export function useTheme(): typeof theme {
  return theme
}
