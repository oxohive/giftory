import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { CatalogStackParamList } from '../../../navigation/types'
import { useTheme } from '../../../theme'
import { ErrorState } from '../../../components/ui/ErrorState'
import { EmptyState } from '../../../components/ui/EmptyState'
import { LoadingState } from '../../../components/ui/LoadingState'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { PriceText } from '../../../components/ui/PriceText'
import { ProductImage } from '../../../components/ui/ProductImage'
import { ScreenHeader } from '../../../components/ui/ScreenHeader'
import { IconButton } from '../../../components/ui/IconButton'
import { useOccasions } from '../hooks/useOccasions'
import { useProducts } from '../hooks/useProducts'
import { useCart } from '../../cart/hooks/useCart'
import { useSingleTapNavigation } from '../../../lib/useSingleTapNavigation'
import { OccasionChip } from '../components/OccasionChip'
import { ProductCard } from '../components/ProductCard'
import type { Occasion } from '../../../lib/api/occasions'

type Props = NativeStackScreenProps<CatalogStackParamList, 'Home'>

const HERO_QUERY = { pageSize: 1, sort: 'newest' as const }
const COLLECTION_QUERY = { pageSize: 7, sort: 'newest' as const }

/**
 * Relies on the app-wide `QueryClientProvider` mounted once in `App.tsx`
 * (TASK-09) — no local provider wrapper needed here.
 *
 * Layout follows the "Home - Featured Gift" design mockup
 * (Supporting-document/GIFTORY.zip): masthead + search entry point, a
 * horizontal occasion pill row (replacing the old 2-column tile grid), one
 * featured hero product, and a horizontal mini collection row below it.
 * Every section is backed by data this app already fetches elsewhere
 * (occasions, products, cart) — no new backend capability. Deliberately
 * NOT included because they'd require features this app doesn't have:
 * a "Namaste, {name}" greeting (guest mode has no customer name), a
 * notifications bell (no notifications feature), and decorative ingredient
 * chips on the hero (no such field on `Product`).
 */
export default function HomeScreen({ navigation }: Props): JSX.Element {
  const theme = useTheme()
  const { guard } = useSingleTapNavigation()
  const { data: occasions, isLoading: occasionsLoading, isError: occasionsError, error, refetch } = useOccasions()
  const { data: hero, isLoading: heroLoading } = useProducts(HERO_QUERY)
  const { data: collection, isLoading: collectionLoading } = useProducts(COLLECTION_QUERY)
  const { cart } = useCart()

  const goToOccasion = guard((occasion: Occasion) => {
    navigation.navigate('ProductList', { occasion: occasion.code })
  })

  const goToAllProducts = guard(() => {
    navigation.navigate('ProductList', undefined)
  })

  const goToProduct = guard((handle: string) => {
    navigation.navigate('ProductDetail', { handle })
  })

  const goToCart = guard(() => navigation.getParent()?.navigate('Cart'))

  if (occasionsLoading) {
    return <LoadingState label="Loading Giftory..." />
  }

  if (occasionsError) {
    return (
      <ErrorState
        message={error?.message ?? 'Failed to load occasions'}
        onRetry={() => refetch()}
      />
    )
  }

  if (!occasions || occasions.length === 0) {
    return (
      <EmptyState
        title="No occasions available right now"
        description="Check back soon, or browse the full catalog instead."
        action={<Button title="Browse all gifts" onPress={goToAllProducts} />}
      />
    )
  }

  const heroProduct = hero?.items[0]
  const collectionProducts = (collection?.items ?? []).filter((p) => p.id !== heroProduct?.id).slice(0, 6)
  const cartCount = cart?.totals.itemCount ?? 0

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* The shared header every other screen uses too — see ScreenHeader's
          own doc comment for why this replaced a one-off masthead here. */}
      <ScreenHeader
        title="Giftory"
        titleIcon="gift"
        rightAction={
          <>
            <IconButton icon="search" size="sm" accessibilityLabel="Search products" onPress={goToAllProducts} />
            <IconButton
              icon="bag-handle-outline"
              size="sm"
              accessibilityLabel={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
              onPress={goToCart}
              badgeCount={cartCount}
            />
          </>
        }
      />

      <Text
        style={[
          theme.typography.body,
          { color: theme.colors.textMuted, paddingHorizontal: 16, marginTop: theme.spacing(0.5) },
        ]}
      >
        Curated gifts for every occasion
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search gifts, hampers, and occasions"
        onPress={goToAllProducts}
        style={[
          pressableStyles.full,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            marginHorizontal: 16,
            marginTop: theme.spacing(2),
          },
        ]}
      >
        <Ionicons name="search" size={theme.sizes.icon.sm} color={theme.colors.textMuted} />
        <Text style={[theme.typography.body, { color: theme.colors.textMuted, marginLeft: theme.spacing(1) }]}>
          Search gifts, hampers, occasions…
        </Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.scroll}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop: theme.spacing(2) }}
        contentContainerStyle={[styles.chipRow, styles.rowStretch]}
      >
        {occasions.map((occasion) => (
          <OccasionChip
            key={occasion.code}
            occasion={occasion}
            selected={false}
            onPress={() => goToOccasion(occasion)}
          />
        ))}
      </ScrollView>

      {heroLoading ? (
        <View style={{ marginTop: theme.spacing(2) }}>
          <LoadingState />
        </View>
      ) : heroProduct ? (
        <View style={{ marginTop: theme.spacing(2) }}>
          <Card style={{ padding: theme.spacing(1.5) }}>
            <View style={styles.heroBadgeRow}>
              <Badge label="Curator's pick" tone="success" />
            </View>
            <ProductImage
              uri={heroProduct.imageUrl}
              aspectRatio={1.2}
              style={{ borderRadius: theme.radii.lg, marginTop: theme.spacing(1.5) }}
              accessibilityLabel={heroProduct.title}
            />
            <View style={styles.heroFooter}>
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.subheading, { color: theme.colors.text }]} numberOfLines={2}>
                  {heroProduct.title}
                </Text>
                <View style={{ marginTop: theme.spacing(0.5) }}>
                  <PriceText
                    amountMajor={heroProduct.pricing.unitPriceGross}
                    currencyCode={heroProduct.pricing.currencyCode}
                    style={theme.typography.subheading}
                  />
                </View>
              </View>
              <IconButton
                icon="arrow-forward"
                size="sm"
                variant="primary"
                accessibilityLabel={`View ${heroProduct.title}`}
                onPress={() => goToProduct(heroProduct.handle)}
              />
            </View>
          </Card>
        </View>
      ) : null}

      {!collectionLoading && collectionProducts.length > 0 ? (
        <View style={{ marginTop: theme.spacing(3) }}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={[theme.typography.subheading, { color: theme.colors.text }]}>More to discover</Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                Fresh arrivals, handpicked
              </Text>
            </View>
            <Text
              onPress={goToAllProducts}
              style={[theme.typography.caption, { color: theme.colors.primary, fontWeight: '700' }]}
            >
              View all
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[{ marginTop: theme.spacing(1.5) }, styles.rowStretch]}
          >
            {collectionProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onPress={() => goToProduct(product.handle)}
                style={styles.collectionCard}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={{ marginTop: theme.spacing(3) }}>
        <Button title="Browse all gifts" variant="secondary" onPress={goToAllProducts} />
      </View>
      </ScrollView>
    </View>
  )
}

const pressableStyles = StyleSheet.create({
  full: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
})

const styles = StyleSheet.create({
  scroll: {
    padding: 16,
    paddingBottom: 32,
  },
  chipRow: {
    paddingRight: 16,
  },
  // Horizontal ScrollView rows default to `alignItems: 'stretch'` on their
  // cross axis — without pinning this to `flex-start`, every row item
  // stretches to fill whatever ambiguous height Yoga resolves for the row
  // (confirmed on-device: product cards in "More to discover" ballooned to
  // fill the rest of the screen instead of staying card-sized).
  rowStretch: {
    alignItems: 'flex-start',
  },
  heroBadgeRow: {
    alignItems: 'center',
  },
  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  collectionCard: {
    width: 168,
    marginRight: 12,
    marginBottom: 0,
  },
})
