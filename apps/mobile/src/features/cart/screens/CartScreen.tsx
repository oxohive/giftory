import { useCallback, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import type { CompositeScreenProps } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { ErrorState } from '../../../components/ui/ErrorState'
import { LoadingState } from '../../../components/ui/LoadingState'
import { PriceText } from '../../../components/ui/PriceText'
import { useTheme } from '../../../theme'
import type { CartStackParamList, RootTabParamList } from '../../../navigation/types'
import type { CartLine } from '../../../lib/api/cart'
import { useCart } from '../hooks/useCart'
import { CartLineRow } from '../components/CartLineRow'
import { cartErrorMessage } from '../lib/cartErrorMessage'

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
  const { cart, isLoading, error, setQuantity, updateGift, removeLine, clear } = useCart()
  const [busyLineId, setBusyLineId] = useState<string | null>(null)
  const [isClearing, setIsClearing] = useState(false)

  const goToCatalog = useCallback(() => {
    // CartScreen's own stack (`CartStackParamList`) only hosts Cart + checkout; the catalog lives in
    // the sibling "Products" tab, so this reaches up to the parent bottom-tab navigator for it.
    navigation.getParent()?.navigate('Products', { screen: 'ProductList' })
  }, [navigation])

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
    setIsClearing(true)
    void clear().finally(() => setIsClearing(false))
  }, [clear])

  const goToCheckout = useCallback(() => {
    navigation.navigate('Address')
  }, [navigation])

  if (isLoading && !cart) {
    return <LoadingState label="Loading your cart..." />
  }

  if (error && !cart) {
    return <ErrorState message={cartErrorMessage(error)} />
  }

  const lines = cart?.lines ?? []

  if (lines.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
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
      {error ? (
        <View style={styles.errorBanner}>
          <ErrorState message={cartErrorMessage(error)} />
        </View>
      ) : null}

      <FlatList
        data={lines}
        keyExtractor={(line) => line.id}
        contentContainerStyle={styles.list}
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
          <Button title="Clear cart" variant="ghost" loading={isClearing} onPress={handleClear} />
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
