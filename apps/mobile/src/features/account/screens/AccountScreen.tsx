/**
 * TASK-08 — Account tab, scoped to guest-only auth (v1 has no login screen).
 *
 * SCOPING DECISION (read this before adding real login):
 *
 * The backend's `GET /storefront/orders` (list) and all
 * `/storefront/account/addresses` endpoints require `requireCustomer()` — a
 * signed-in session — which this app cannot produce in v1. So, for this pass:
 *
 *  - Account tab (this screen): always renders a real, finished screen — a
 *    guest-mode banner instead of a crash or a dead end. It does not pretend
 *    to offer account features (profile, saved payment methods, etc.) that
 *    can't be delivered without a session.
 *  - Order history: instead of calling the authenticated list endpoint, this
 *    app tracks order IDs locally on-device (`useLocalOrderHistory`, backed
 *    by `expo-secure-store`) the moment TASK-07's checkout places an order,
 *    then re-fetches each one via `GET /storefront/orders/{id}` — which does
 *    work for a guest holding the `sf_order_access` cookie set at checkout.
 *    This gives a real "my recent orders" list scoped to this device, not
 *    the full cross-device history a signed-in customer would get.
 *  - Address book (AddressesScreen): the full CRUD UI is built against the
 *    real endpoints, but gated behind a "sign in to manage saved addresses"
 *    message, since every call 401s without a session.
 *
 * WHEN REAL LOGIN LANDS, flip these (this is the entire fast-follow):
 *  1. Replace this guest banner with real account state (profile, sign out).
 *  2. Swap `useLocalOrderHistory` for a call to `listMyOrders()` (already
 *     implemented in `src/lib/api/orders.ts`, unused today on purpose).
 *  3. Remove the 401 gating condition in AddressesScreen.tsx — the screen's
 *     structure underneath is already the real CRUD UI, nothing else to build.
 *
 * Do not call `listMyOrders()` anywhere in this pass — see TASK-08's
 * Non-goals. Do not log or surface the `sf_order_access` cookie/token; the
 * backend is solely responsible for keeping one guest from guessing another
 * guest's order.
 */
import { useCallback } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { AccountStackParamList } from '../../../navigation/types'
import { useTheme } from '../../../theme'
import { Badge } from '../../../components/ui/Badge'
import { Card } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/EmptyState'
import { LoadingState } from '../../../components/ui/LoadingState'
import { useLocalOrderHistory, type TrackedOrder } from '../../orders/hooks/useLocalOrderHistory'

type Props = NativeStackScreenProps<AccountStackParamList, 'Account'>

function formatPlacedAt(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AccountScreen({ navigation }: Props): JSX.Element {
  const theme = useTheme()
  const { orders, isLoading } = useLocalOrderHistory()

  const handleOpenOrder = useCallback(
    (orderId: string) => {
      navigation.navigate('OrderDetail', { orderId })
    },
    [navigation],
  )

  const renderOrder = useCallback(
    ({ item }: { item: TrackedOrder }) => (
      <Pressable
        onPress={() => handleOpenOrder(item.orderId)}
        accessibilityRole="button"
        accessibilityLabel={`Order ${item.orderNumber}`}
        style={{ marginBottom: theme.spacing(1.5) }}
      >
        <Card>
          <View style={styles.orderRow}>
            <View style={styles.orderInfo}>
              <Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
                {item.orderNumber}
              </Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                {formatPlacedAt(item.placedAt)}
              </Text>
            </View>
            <Badge label="View" tone="info" />
          </View>
        </Card>
      </Pressable>
    ),
    [handleOpenOrder, theme],
  )

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={{ padding: theme.spacing(2) }}>
        <Text style={[theme.typography.heading, { color: theme.colors.text }]}>Account</Text>

        <Card style={{ marginTop: theme.spacing(2) }}>
          <Badge label="Browsing as guest" tone="warning" />
          <Text style={[theme.typography.body, { color: theme.colors.text, marginTop: theme.spacing(1) }]}>
            Sign in coming soon.
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing(0.5) }]}>
            You can still check out as a guest and track orders you place on this device below.
          </Text>
        </Card>

        <Pressable
          onPress={() => navigation.navigate('Addresses')}
          accessibilityRole="button"
          accessibilityLabel="Saved addresses"
          style={{ marginTop: theme.spacing(2) }}
        >
          <Card>
            <Text style={[theme.typography.subheading, { color: theme.colors.text }]}>Saved addresses</Text>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
              Manage delivery addresses
            </Text>
          </Card>
        </Pressable>

        <Text
          style={[
            theme.typography.subheading,
            { color: theme.colors.text, marginTop: theme.spacing(3), marginBottom: theme.spacing(1) },
          ]}
        >
          Your orders on this device
        </Text>
      </View>

      {isLoading ? (
        <LoadingState label="Loading your orders" />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="Orders you place on this device will show up here so you can track them."
        />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.orderId}
          renderItem={renderOrder}
          contentContainerStyle={{ paddingHorizontal: theme.spacing(2), paddingBottom: theme.spacing(3) }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderInfo: {
    flexShrink: 1,
  },
})
