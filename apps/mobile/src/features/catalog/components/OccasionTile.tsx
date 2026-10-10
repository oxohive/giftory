import React from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../../../theme'
import { Card } from '../../../components/ui/Card'
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
        <View style={[styles.imageWrap, { backgroundColor: theme.colors.background, borderRadius: theme.radii.md }]}>
          {occasion.imageUrl ? (
            <Image source={{ uri: occasion.imageUrl }} style={styles.image} resizeMode="cover" />
          ) : null}
        </View>
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
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
})
