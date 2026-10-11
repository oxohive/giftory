import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../../../theme'
import { Card } from '../../../components/ui/Card'
import { ProductImage } from '../../../components/ui/ProductImage'
import type { Occasion } from '../../../lib/api/occasions'

export interface OccasionTileProps {
  occasion: Occasion
  onPress: () => void
}

/** A single "Shop by occasion" tile on the Home screen. */
export function OccasionTile(props: OccasionTileProps): JSX.Element {
  const { occasion, onPress } = props
  const theme = useTheme()

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Shop ${occasion.label}`}
      style={styles.wrapper}
    >
      <Card style={styles.card}>
        <ProductImage uri={occasion.imageUrl} style={styles.imageWrap} accessibilityLabel={occasion.label} />
        <Text
          style={[theme.typography.subheading, { color: theme.colors.text, marginTop: theme.spacing(1) }]}
          numberOfLines={1}
        >
          {occasion.label}
        </Text>
        {occasion.description ? (
          <Text
            style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing(0.5) }]}
            numberOfLines={2}
          >
            {occasion.description}
          </Text>
        ) : null}
      </Card>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    width: '48%',
    marginBottom: 16,
  },
  card: {
    alignItems: 'flex-start',
  },
  imageWrap: {
    width: '100%',
    height: 96,
  },
})
