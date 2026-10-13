import React, { useState } from 'react'
import { Image } from 'expo-image'
import type { ImageStyle } from 'expo-image'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
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
 * fade-in, and the missing/failed-image fallback stay consistent everywhere.
 *
 * - Has a `uri`: renders via `expo-image` with disk caching and a fade-in
 *   transition, backed by a themed placeholder color while it loads.
 * - No `uri` (missing/null/empty), OR a `uri` that fails to load at runtime
 *   (404, decode failure, dropped connection): renders a themed box with a
 *   centered icon glyph — a flat color box with nothing in it read as a
 *   rendering glitch on-device (confirmed: occasion pills and the Home hero
 *   both looked broken before this), so every size uses the same icon
 *   rather than an empty fill, for both the missing-uri and failed-load
 *   cases.
 */
export function ProductImage(props: ProductImageProps): JSX.Element {
  const { uri, style, aspectRatio = 1, accessibilityLabel } = props
  const theme = useTheme()
  const [failed, setFailed] = useState(false)

  // Reset the failure flag if a new `uri` comes in (e.g. list item reused
  // by a virtualized list for a different product) — otherwise a prior
  // image's load failure would permanently show the fallback for every
  // subsequent uri rendered through this same component instance.
  const [lastUri, setLastUri] = useState(uri)
  if (uri !== lastUri) {
    setLastUri(uri)
    if (failed) setFailed(false)
  }

  const sharedStyle = {
    aspectRatio,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radii.lg,
  }

  if (!uri || failed) {
    return (
      <View
        style={[styles.base, styles.placeholder, sharedStyle, style as StyleProp<ViewStyle>]}
        accessibilityLabel={accessibilityLabel}
      >
        <Ionicons name="gift-outline" size={theme.sizes.icon.lg} color={theme.colors.textMuted} />
      </View>
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
      onError={() => setFailed(true)}
    />
  )
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    overflow: 'hidden',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
