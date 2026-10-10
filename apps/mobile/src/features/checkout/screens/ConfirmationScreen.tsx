import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { CheckoutStackParamList } from '../../../navigation/types'
import { ApiError } from '../../../lib/api/errors'
import { getOrder } from '../../../lib/api/orders'
import type { OrderDetail } from '../../../lib/api/orders'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { ErrorState } from '../../../components/ui/ErrorState'
import { LoadingState } from '../../../components/ui/LoadingState'
import { PriceText } from '../../../components/ui/PriceText'
import { useTheme } from '../../../theme'
import { useCheckoutSession } from '../hooks/useCheckoutSession'
import { useCart } from '../../cart/hooks/useCart'
import { useLocalOrderHistory } from '../../orders/hooks/useLocalOrderHistory'

type Props = NativeStackScreenProps<CheckoutStackParamList, 'Confirmation'>

export default function ConfirmationScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const session = useCheckoutSession()
  const { orderId } = route.params
  const { clear: clearCart } = useCart()
  const { track: trackOrder } = useLocalOrderHistory()

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const detail = await getOrder(orderId)
        if (!cancelled) setOrder(detail)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Your order was placed, but we couldn't load its details right now.",
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [orderId])

  useEffect(() => {
    // The order is confirmed at this point (we only get here after a
    // successful Razorpay payment + backend confirm), so the cart it was
    // built from is now emptied, and the order is recorded in this device's
    // local order history (see useLocalOrderHistory.ts) so it shows up under
    // Account -> Orders even though there's no authenticated order list.
    void clearCart().catch(() => {
      // Best-effort: if the clear fails (e.g. network blip), the next cart
      // fetch will still reflect the server's authoritative state — the
      // order itself is already placed and unaffected.
    })
    void trackOrder({
      orderId,
      orderNumber: order?.orderNumber || orderId,
      placedAt: new Date().toISOString(),
    })
    // Intentionally run once per order placement: `clearCart`/`trackOrder`
    // are stable across renders (useCallback-wrapped) and `order` arriving
    // later only affects the tracked `orderNumber` label, not whether this
    // runs again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  function handleContinueShopping(): void {
    // The attempt is complete — rotate the idempotency key so any future
    // checkout starts a brand-new attempt rather than reusing this one's key.
    session.restart()
    // Pop back to the 'Cart' screen that hosts this checkout stack, without
    // referencing it by name across param lists (this screen is only typed
    // against CheckoutStackParamList, which doesn't include 'Cart').
    navigation.popToTop()
  }

  if (loading) return <LoadingState label="Loading your order..." />

  return (
    <ScrollView contentContainerStyle={{ padding: theme.spacing(2), gap: theme.spacing(1.5) }}>
      <Badge label="Order placed" tone="success" />
      <Text style={[theme.typography.heading, { color: theme.colors.text }]}>Thank you!</Text>

      {error ? (
        <ErrorState message={error} />
      ) : order ? (
        <>
          <Card>
            <Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
              Order {order.orderNumber || orderId}
            </Text>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
              Status: {order.status || 'Processing'}
            </Text>
          </Card>

          <Card>
            <Text
              style={[
                theme.typography.subheading,
                { color: theme.colors.text, marginBottom: theme.spacing(1) },
              ]}
            >
              Items
            </Text>
            {order.lines.map((line) => (
              <View key={line.id} style={styles.lineRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[theme.typography.body, { color: theme.colors.text }]}>
                    {line.productTitle} × {line.quantity}
                  </Text>
                  {line.giftWrap ? (
                    <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>Gift wrapped</Text>
                  ) : null}
                  {line.giftMessage ? (
                    <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                      &ldquo;{line.giftMessage}&rdquo;
                    </Text>
                  ) : null}
                </View>
                <PriceText amountMajor={line.unitPriceMajor * line.quantity} currencyCode={order.currencyCode} />
              </View>
            ))}
          </Card>

          <Card>
            <View style={styles.row}>
              <Text style={[theme.typography.subheading, { color: theme.colors.text }]}>Total paid</Text>
              <PriceText amountMajor={order.grandTotalGrossMajor} currencyCode={order.currencyCode} />
            </View>
          </Card>
        </>
      ) : null}

      <Button title="Continue shopping" onPress={handleContinueShopping} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
})
