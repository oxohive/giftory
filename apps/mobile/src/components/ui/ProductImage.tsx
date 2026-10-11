import React from 'react'
import { Image } from 'expo-image'
import type { ImageStyle } from 'expo-image'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { useTheme } from '../../theme'

export interface ProductImageProps {
  uri?: string | null
  style?: StyleProp<ViewStyle>
  /** Width:height ratio — default 1 (square). ProductDetailScreen's hero image may want a different ratio. */
  aspectRatio?: number
  accessibilityLabel?: string
}

/**
 * Shared product/occasion image. Every image in the app goes through this
 * component rather than a raw `expo-image`/RN `Image` call, so caching,
 * fade-in, and the missing-image fallback stay consistent everywhere.
 *
 * - Has a `uri`: renders via `expo-image` with disk caching and a fade-in
 *   transition, backed by a themed placeholder color while it loads.
 * - No `uri` (missing/null/empty): renders a plain themed placeholder box —
 *   no broken-image icon, just `theme.colors.surface` — instead of a blank
 *   white gap.
 */
export function ProductImage(props: ProductImageProps): JSX.Element {
  const { uri, style, aspectRatio = 1, accessibilityLabel } = props
  const theme = useTheme()

  const sharedStyle = {
    aspectRatio,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
  }

  if (!uri) {
    return (
      <View
        style={[styles.base, sharedStyle, style as StyleProp<ViewStyle>]}
        accessibilityLabel={accessibilityLabel}
      />
    )
  }

  return (
    <Image
      source={{ uri }}
      // `backgroundColor` above shows through as a themed solid-color
      // placeholder until the image decodes, then the fade-in transition
      // takes over — no separate `placeholder` asset needed for this pass.
      style={[styles.base, sharedStyle, style] as StyleProp<ImageStyle>}
      cachePolicy="disk"
      transition={200}
      contentFit="cover"
      accessibilityLabel={accessibilityLabel}
    />
  )
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    overflow: 'hidden',
  },
})
