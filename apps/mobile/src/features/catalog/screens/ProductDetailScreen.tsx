import React, { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { CatalogStackParamList } from '../../../navigation/types'
import { useTheme } from '../../../theme'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { PriceText } from '../../../components/ui/PriceText'
import { LoadingState } from '../../../components/ui/LoadingState'
import { ErrorState } from '../../../components/ui/ErrorState'
import { EmptyState } from '../../../components/ui/EmptyState'
import { ProductImage } from '../../../components/ui/ProductImage'
import { ScreenHeader } from '../../../components/ui/ScreenHeader'
import { useProductDetail } from '../hooks/useProductDetail'
import { FilterChip } from '../components/FilterChip'
import { useCart } from '../../cart/hooks/useCart'

type Props = NativeStackScreenProps<CatalogStackParamList, 'ProductDetail'>

/**
 * Relies on the app-wide `QueryClientProvider` mounted once in `App.tsx`
 * (TASK-09) — no local provider wrapper needed here. This also means
 * `useCart()` below shares the same cache as the Cart tab/checkout screens.
 */
export default function ProductDetailScreen({ route, navigation }: Props): JSX.Element {
  const theme = useTheme()
  const { handle } = route.params
  const { data: product, isLoading, isError, error, refetch } = useProductDetail(handle)
  const { addLine } = useCart()

  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(undefined)
  const [giftWrap, setGiftWrap] = useState(false)
  const [giftMessage, setGiftMessage] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const variants = product?.variants ?? []

  const selectedVariant = useMemo(() => {
    if (variants.length === 0) return undefined
    return variants.find((v) => v.id === selectedVariantId) ?? variants[0]
  }, [variants, selectedVariantId])

  // Generic title, not the product's own name — the body below already
  // shows that prominently as its own heading right under the hero image.
  const screenHeader = <ScreenHeader title="Product" onBack={navigation.goBack} />

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {screenHeader}
        <LoadingState label="Loading product..." />
      </View>
    )
  }

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {screenHeader}
        <ErrorState
          message={error?.message ?? 'Failed to load product'}
          onRetry={() => refetch()}
        />
      </View>
    )
  }

  if (!product) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {screenHeader}
        <EmptyState title="Product not found" />
      </View>
    )
  }

  const displayPricing = selectedVariant?.pricing ?? product.pricing
  const isCustomizable = product.isConfigurable || product.gift.isCustomizable
  const giftMessageMax = product.gift.giftMessageMaxLength
  const giftMessageOver = giftMessage.length - giftMessageMax
  const giftMessageError =
    giftMessageOver > 0
      ? `Message is ${giftMessageOver} character${giftMessageOver === 1 ? '' : 's'} over the ${giftMessageMax}-character limit`
      : undefined

  const heroImageUrl = product.media[0]?.url ?? product.imageUrl

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {screenHeader}
      <ScrollView contentContainerStyle={{ padding: theme.spacing(2) }}>
      <ProductImage
        uri={heroImageUrl}
        style={[styles.heroImage, { borderRadius: theme.radii.xl }]}
        accessibilityLabel={product.title}
      />

      <View style={styles.headerRow}>
        <Text style={[theme.typography.heading, { color: theme.colors.text, flex: 1 }]}>
          {product.title}
        </Text>
        {isCustomizable ? <Badge label="Customizable" /> : null}
      </View>

      {product.subtitle ? (
        <Text
          style={[theme.typography.body, { color: theme.colors.textMuted, marginTop: theme.spacing(0.5) }]}
        >
          {product.subtitle}
        </Text>
      ) : null}

      <View style={{ marginTop: theme.spacing(1.5) }}>
        <PriceText
          amountMajor={displayPricing.unitPriceGross}
          currencyCode={displayPricing.currencyCode}
          style={theme.typography.heading}
        />
      </View>

      {product.description ? (
        <Text style={[theme.typography.body, { color: theme.colors.text, marginTop: theme.spacing(1.5) }]}>
          {product.description}
        </Text>
      ) : null}

      {variants.length > 1 ? (
        <View style={{ marginTop: theme.spacing(2) }}>
          <Text style={[theme.typography.subheading, { color: theme.colors.text }]}>Options</Text>
          <View style={styles.chipRow}>
            {variants.map((variant) => (
              <FilterChip
                key={variant.id}
                label={variant.title}
                selected={selectedVariant?.id === variant.id}
                onPress={() => setSelectedVariantId(variant.id)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {product.gift.giftWrapAvailable ? (
        <View style={styles.switchRow}>
          <Text style={[theme.typography.body, { color: theme.colors.text }]}>Add gift wrap</Text>
          <Switch
            value={giftWrap}
            onValueChange={setGiftWrap}
            accessibilityLabel="Add gift wrap"
            accessibilityRole="switch"
            trackColor={{ true: theme.colors.primary }}
          />
        </View>
      ) : null}

      <View style={{ marginTop: theme.spacing(2) }}>
        <Input
          label={`Gift message (${giftMessage.length}/${giftMessageMax})`}
          value={giftMessage}
          onChangeText={setGiftMessage}
          placeholder="Add a personal note (optional)"
          error={giftMessageError}
          accessibilityLabel="Gift message"
        />
      </View>

      <View style={{ marginTop: theme.spacing(3) }}>
        <Button
          title="Add to cart"
          disabled={Boolean(giftMessageError)}
          loading={isAdding}
          onPress={() => {
            // Success/failure feedback is already handled globally by
            // useCart()'s addLine mutation (toast + haptics) — no local
            // inline message needed here; this screen only needs to track
            // its own button's busy state.
            setIsAdding(true)
            addLine({
              productId: product.id,
              variantId: selectedVariant?.id,
              quantity: 1,
              giftWrap,
              giftMessage: giftMessage || undefined,
            })
              .catch(() => {
                // Already surfaced via the global toast; nothing else to do here.
              })
              .finally(() => setIsAdding(false))
          }}
        />
      </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroImage: {
    height: 240,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  switchRow: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})
