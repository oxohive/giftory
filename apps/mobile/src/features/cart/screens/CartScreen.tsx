import { useCallback, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import type { CompositeScreenProps } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/EmptyState'
import { ErrorState } from '../../../components/ui/ErrorState'
import { PriceText } from '../../../components/ui/PriceText'
import { Skeleton } from '../../../components/ui/Skeleton'
import { ScreenHeader } from '../../../components/ui/ScreenHeader'
import { useTheme } from '../../../theme'
import { confirmDestructive } from '../../../lib/confirm'
import { useSingleTapNavigation } from '../../../lib/useSingleTapNavigation'
import type { CartStackParamList, RootTabParamList } from '../../../navigation/types'
import type { CartLine } from '../../../lib/api/cart'
import { CART_QUERY_KEY, useCart } from '../hooks/useCart'
import { CartLineRow } from '../components/CartLineRow'
import { cartErrorMessage } from '../lib/cartErrorMessage'

/** Placeholder shaped like `CartLineRow` — title/price header, a couple of detail lines, and an action row. */
function CartLineRowSkeleton(): JSX.Element {
  const theme = useTheme()
  return (
    <Card style={styles.skeletonCard}>
      <View style={styles.header}>
        <Skeleton width="60%" height={18} />
        <Skeleton width={64} height={18} />
      </View>
      <Skeleton width="40%" height={14} style={{ marginTop: theme.spacing(1.5) }} />
      <Skeleton width={120} height={32} borderRadius={theme.radii.sm} style={{ marginTop: theme.spacing(1.5) }} />
      <Skeleton width="100%" height={40} borderRadius={theme.radii.sm} style={{ marginTop: theme.spacing(1.5) }} />
    </Card>
  )
}

type Props = CompositeScreenProps<
  NativeStackScreenProps<CartStackParamList, 'Cart'>,
  BottomTabScreenProps<RootTabParamList>
>

/**
 * Relies on the app-wide `QueryClientProvider` mounted once in `App.tsx`
 * (TASK-09) — no local provider wrapper needed here.
 */
export default function CartScreen({ navigation }: Props): JSX.Element {
  const theme = useTheme()
  const queryClient = useQueryClient()
  const { guard } = useSingleTapNavigation()
  const { cart, isLoading, error, setQuantity, updateGift, removeLine, clear } = useCart()
  const [busyLineId, setBusyLineId] = useState<string | null>(null)
  const [isClearing, setIsClearing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const goToCatalog = guard(() => {
    // CartScreen's own stack (`CartStackParamList`) only hosts Cart + checkout; the catalog lives in
    // the sibling "Products" tab, so this reaches up to the parent bottom-tab navigator for it.
    navigation.getParent()?.navigate('Products', { screen: 'ProductList' })
  })

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await queryClient.refetchQueries({ queryKey: CART_QUERY_KEY })
    } finally {
      setRefreshing(false)
    }
  }, [queryClient])

  const handleQuantityChange = useCallback(
    (line: CartLine, quantity: number) => {
      if (quantity < 1) {
        setBusyLineId(line.id)
        void removeLine(line.id).finally(() => setBusyLineId(null))
        return
      }
      setBusyLineId(line.id)
      void setQuantity(line.id, quantity).finally(() => setBusyLineId(null))
    },
    [removeLine, setQuantity],
  )

  const handleGiftChange = useCallback(
    (line: CartLine, patch: { giftWrap?: boolean; giftMessage?: string }) => {
      setBusyLineId(line.id)
      void updateGift(line.id, patch).finally(() => setBusyLineId(null))
    },
    [updateGift],
  )

  const handleRemove = useCallback(
    (line: CartLine) => {
      setBusyLineId(line.id)
      void removeLine(line.id).finally(() => setBusyLineId(null))
    },
    [removeLine],
  )

  const handleClear = useCallback(() => {
    confirmDestructive({
      title: 'Clear cart?',
      message: 'This removes all items from your cart. This can’t be undone.',
      confirmLabel: 'Clear cart',
      onConfirm: () => {
        setIsClearing(true)
        void clear().finally(() => setIsClearing(false))
      },
    })
  }, [clear])

  const goToCheckout = guard(() => {
    navigation.navigate('Address')
  })

  // Cart is always the "Cart" tab's own root — never pushed onto — so,
  // like Home/Account, it never needs a back button.
  const screenHeader = <ScreenHeader title="Cart" />

  if (isLoading && !cart) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {screenHeader}
        <View style={styles.list} accessibilityLabel="Loading your cart">
          <CartLineRowSkeleton />
          <CartLineRowSkeleton />
          <CartLineRowSkeleton />
        </View>
      </View>
    )
  }

  if (error && !cart) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {screenHeader}
        <ErrorState message={cartErrorMessage(error)} />
      </View>
    )
  }

  const lines = cart?.lines ?? []

  if (lines.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {screenHeader}
        <EmptyState
          title="Your cart is empty"
          description="Browse the catalog to find the perfect gift."
          action={<Button title="Browse products" onPress={goToCatalog} />}
        />
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {screenHeader}
      {error ? (
        <View style={styles.errorBanner}>
          <ErrorState message={cartErrorMessage(error)} />
        </View>
      ) : null}

      <FlatList
        data={lines}
        keyExtractor={(line) => line.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
        renderItem={({ item }) => (
          <CartLineRow
            line={item}
            currencyCode={cart?.currencyCode ?? 'INR'}
            busy={busyLineId === item.id}
            onQuantityChange={(quantity) => handleQuantityChange(item, quantity)}
            onGiftChange={(patch) => handleGiftChange(item, patch)}
            onRemove={() => handleRemove(item)}
          />
        )}
      />

      <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
        <View style={styles.totalsRow}>
          <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
            {cart?.totals.itemCount ?? 0} item{(cart?.totals.itemCount ?? 0) === 1 ? '' : 's'}
          </Text>
          <PriceText
            amountMajor={cart?.totals.subtotalMajor ?? 0}
            currencyCode={cart?.currencyCode}
            style={theme.typography.subheading}
          />
        </View>
        <View style={styles.footerActions}>
          <Button title="Clear cart" variant="destructive" loading={isClearing} onPress={handleClear} />
          <Button title="Checkout" onPress={goToCheckout} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    padding: 16,
  },
  skeletonCard: {
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorBanner: {
    paddingHorizontal: 8,
  },
  footer: {
    borderTopWidth: 1,
    padding: 16,
  },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})
