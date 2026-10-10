/**
 * Order detail — fetched via `getOrder(orderId)` (src/lib/api/orders.ts),
 * which works for a guest holding the `sf_order_access` cookie set during
 * TASK-07's checkout, or the owning signed-in customer. This screen is
 * reached either from a tracked order on AccountScreen (guest-only v1) or
 * from TASK-07's confirmation flow. Does not call `listMyOrders()` — see
 * TASK-08's Non-goals.
 */
import { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { AccountStackParamList } from '../../../navigation/types'
import { getOrder, type OrderDetail } from '../../../lib/api/orders'
import { ApiError } from '../../../lib/api/errors'
import { useTheme } from '../../../theme'
import { Badge } from '../../../components/ui/Badge'
import { Card } from '../../../components/ui/Card'
import { ErrorState } from '../../../components/ui/ErrorState'
import { LoadingState } from '../../../components/ui/LoadingState'
import { PriceText } from '../../../components/ui/PriceText'

type Props = NativeStackScreenProps<AccountStackParamList, 'OrderDetail'>

function badgeToneForStatus(status: string): 'info' | 'success' | 'warning' {
  const normalized = status.toLowerCase()
  if (normalized.includes('paid') || normalized.includes('delivered') || normalized.includes('complete')) {
    return 'success'
  }
  if (normalized.includes('fail') || normalized.includes('cancel') || normalized.includes('pending')) {
    return 'warning'
  }
  return 'info'
}

function formatPlacedAt(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function OrderDetailScreen({ route }: Props): JSX.Element {
  const { orderId } = route.params
  const theme = useTheme()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<OrderDetail | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const detail = await getOrder(orderId)
      setOrder(detail)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this order.')
    } finally {
      setIsLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    load()
  }, [load])

  if (isLoading) {
    return <LoadingState label="Loading order" />
  }

  if (error || !order) {
    return <ErrorState message={error ?? 'Order not found.'} onRetry={load} />
  }

  const address = order.shippingAddress

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.spacing(2) }}
    >
      <Text style={[theme.typography.heading, { color: theme.colors.text }]}>{order.orderNumber}</Text>
      <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing(0.5) }]}>
        Placed {formatPlacedAt(order.placedAt)}
      </Text>

      <View style={[styles.row, { marginTop: theme.spacing(1.5) }]}>
        {order.status ? <Badge label={order.status} tone={badgeToneForStatus(order.status)} /> : null}
        {order.payment.status ? (
          <View style={{ marginLeft: theme.spacing(1) }}>
            <Badge label={`Payment: ${order.payment.status}`} tone={badgeToneForStatus(order.payment.status)} />
          </View>
        ) : null}
      </View>

      <Card style={{ marginTop: theme.spacing(2) }}>
        <Text style={[theme.typography.subheading, { color: theme.colors.text, marginBottom: theme.spacing(1) }]}>
          Items
        </Text>
        {order.lines.map((line, index) => (
          <View
            key={line.id}
            style={[
              styles.lineRow,
              index < order.lines.length - 1 && {
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
                paddingBottom: theme.spacing(1),
                marginBottom: theme.spacing(1),
              },
            ]}
          >
            <View style={{ flex: 1, marginRight: theme.spacing(1) }}>
              <Text style={[theme.typography.body, { color: theme.colors.text }]}>{line.productTitle}</Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                Qty {line.quantity}
                {line.giftWrap ? ' · Gift wrapped' : ''}
              </Text>
              {line.giftMessage ? (
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                  "{line.giftMessage}"
                </Text>
              ) : null}
            </View>
            <PriceText amountMajor={line.unitPriceMajor} currencyCode={order.currencyCode} />
          </View>
        ))}
      </Card>

      <Card style={{ marginTop: theme.spacing(2) }}>
        <Text style={[theme.typography.subheading, { color: theme.colors.text, marginBottom: theme.spacing(1) }]}>
          Delivery
        </Text>
        <Text style={[theme.typography.body, { color: theme.colors.text }]}>{address.fullName}</Text>
        <Text style={[theme.typography.body, { color: theme.colors.text }]}>
          {address.line1}
          {address.line2 ? `, ${address.line2}` : ''}
        </Text>
        <Text style={[theme.typography.body, { color: theme.colors.text }]}>
          {address.city}, {address.state} {address.postalCode}
        </Text>
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing(0.5) }]}>
          {address.phone}
        </Text>
      </Card>

      <Card style={{ marginTop: theme.spacing(2) }}>
        <Text style={[theme.typography.subheading, { color: theme.colors.text, marginBottom: theme.spacing(1) }]}>
          Total
        </Text>
        <View style={styles.row}>
          <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>Grand total</Text>
          <PriceText amountMajor={order.grandTotalGrossMajor} currencyCode={order.currencyCode} />
        </View>
      </Card>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
})
