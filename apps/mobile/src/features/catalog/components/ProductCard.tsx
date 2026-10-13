import React from 'react'
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'
import { useTheme } from '../../../theme'
import { Card } from '../../../components/ui/Card'
import { PriceText } from '../../../components/ui/PriceText'
import { Badge } from '../../../components/ui/Badge'
import { ProductImage } from '../../../components/ui/ProductImage'
import type { Product } from '../../../lib/api/catalog'

export interface ProductCardProps {
  product: Product
  onPress: () => void
  /** Overrides the default 2-col-grid wrapper sizing — used for horizontal rows (e.g. Home's mini collection). */
  style?: StyleProp<ViewStyle>
}

/** A single product tile in the Product List grid. */
export function ProductCard(props: ProductCardProps): JSX.Element {
  const { product, onPress, style } = props
  const theme = useTheme()

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={product.title}
      style={[styles.wrapper, style]}
    >
      <Card>
        <ProductImage uri={product.imageUrl} style={styles.imageWrap} accessibilityLabel={product.title} />
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
  },
  footerRow: {
    marginTop: 8,
    // Stacked, not side-by-side: on a 2-col grid card (~160px wide) there
    // isn't room for a price AND a "Customizable" pill in one row without
    // one of them spilling past the card edge — confirmed on-device.
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
  },
})
