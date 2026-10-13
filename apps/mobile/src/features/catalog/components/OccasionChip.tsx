import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme } from '../../../theme'
import { ProductImage } from '../../../components/ui/ProductImage'
import type { Occasion } from '../../../lib/api/occasions'

export interface OccasionChipProps {
  occasion: Occasion
  selected: boolean
  onPress: () => void
}

/**
 * Horizontal pill used in Home's "shop by occasion" row — a small circular
 * thumbnail plus label, selectable like a filter chip. Replaces the old
 * 2-column `OccasionTile` grid on Home (still used nowhere else, since
 * Home was the only screen that rendered occasions as tiles).
 */
export function OccasionChip(props: OccasionChipProps): JSX.Element {
  const { occasion, selected, onPress } = props
  const theme = useTheme()

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Shop ${occasion.label}`}
      style={[
        styles.base,
        {
          borderRadius: theme.radii.pill,
          backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
          borderWidth: selected ? 0 : 1,
          borderColor: theme.colors.border,
          paddingVertical: theme.spacing(0.75),
          paddingHorizontal: theme.spacing(1.75),
        },
      ]}
    >
      {occasion.imageUrl ? (
        <ProductImage uri={occasion.imageUrl} style={styles.thumb} accessibilityLabel={occasion.label} />
      ) : (
        // No image for this occasion in the catalog data — a blank tinted
        // circle read as a stray rendering glitch next to the label
        // (confirmed on-device), so fall back to a plain icon glyph instead,
        // which reads as an intentional choice rather than missing data.
        <View
          style={[
            styles.thumb,
            styles.iconFallback,
            { backgroundColor: selected ? 'rgba(255,255,255,0.25)' : theme.colors.background },
          ]}
        >
          <Ionicons
            name="gift-outline"
            size={14}
            color={selected ? theme.colors.primaryText : theme.colors.textMuted}
          />
        </View>
      )}
      <Text
        style={[
          theme.typography.body,
          { color: selected ? theme.colors.primaryText : theme.colors.text, fontWeight: '700' },
        ]}
        numberOfLines={1}
      >
        {occasion.label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 10,
  },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  iconFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
