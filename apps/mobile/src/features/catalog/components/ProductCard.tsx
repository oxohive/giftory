import React from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../../../theme'
import { Card } from '../../../components/ui/Card'
import { PriceText } from '../../../components/ui/PriceText'
import { Badge } from '../../../components/ui/Badge'
import type { Product } from '../../../lib/api/catalog'

export interface ProductCardProps {
  product: Product
  onPress: () => void
}

/** A single product tile in the Product List grid. */
export function ProductCard(props: ProductCardProps): JSX.Element {
  const { product, onPress } = props
  const theme = useTheme()

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={product.title}
      style={styles.wrapper}
    >
      <Card>
        <View style={[styles.imageWrap, { backgroundColor: theme.colors.background, borderRadius: theme.radii.md }]}>
          {product.imageUrl ? (
            <Image source={{ uri: product.imageUrl }} style={styles.image} resizeMode="cover" />
          ) : null}
        </View>
        <Text
          style={[theme.typography.subheading, { color: theme.colors.text, marginTop: theme.spacing(1) }]}
          numberOfLines={2}
        >
          {product.title}
        </Text>
        {product.subtitle ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {product.subtitle}
          </Text>
        ) : null}
        <View style={styles.footerRow}>
          <PriceText amountMajor={product.pricing.unitPriceGross} currencyCode={product.pricing.currencyCode} />
          {product.isConfigurable ? <Badge label="Customizable" /> : null}
        </View>
      </Card>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    width: '48%',
    marginBottom: 16,
  },
  imageWrap: {
    width: '100%',
    height: 120,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  footerRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})
