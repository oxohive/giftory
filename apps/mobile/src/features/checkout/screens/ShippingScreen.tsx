import { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { CheckoutStackParamList } from '../../../navigation/types'
import { getShippingMethods } from '../../../lib/api/checkout'
import type { ShippingMethod } from '../../../lib/api/checkout'
import { ApiError } from '../../../lib/api/errors'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { ErrorState } from '../../../components/ui/ErrorState'
import { LoadingState } from '../../../components/ui/LoadingState'
import { PriceText } from '../../../components/ui/PriceText'
import { useTheme } from '../../../theme'
import { useCheckoutSession } from '../hooks/useCheckoutSession'
import { useCart } from '../../cart/hooks/useCart'

type Props = NativeStackScreenProps<CheckoutStackParamList, 'Shipping'>

export default function ShippingScreen({ navigation }: Props) {
  const theme = useTheme()
  const session = useCheckoutSession()
  const postalCode = session.address?.postalCode

  const [methods, setMethods] = useState<ShippingMethod[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(session.shippingMethod?.id ?? null)

  // Real cart totals, shared with the Cart tab/checkout screens via the
  // app-wide QueryClientProvider (TASK-09) — used to quote accurate shipping
  // rates (free-shipping thresholds, weight tiers, etc).
  const { cart } = useCart()
  const cartSubtotalMajor = cart?.totals.subtotalMajor ?? 0
  const cartItemCount = cart?.totals.itemCount ?? 1

  const load = useCallback(async () => {
    if (!postalCode) {
      navigation.replace('Address')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const items = await getShippingMethods({
        subtotalMajor: cartSubtotalMajor,
        itemCount: cartItemCount,
        postalCode,
      })
      setMethods(items)
      setSelectedId((current) => (current && items.some((m) => m.id === current) ? current : items[0]?.id ?? null))
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not load shipping methods. Check your connection and try again.',
      )
    } finally {
      setLoading(false)
    }
  }, [postalCode, cartSubtotalMajor, cartItemCount])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <LoadingState label="Loading shipping options..." />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!methods || methods.length === 0) {
    return <ErrorState message="No shipping methods are available for this address." onRetry={load} />
  }

  const selected = methods.find((m) => m.id === selectedId) ?? methods[0]
  const estimatedTotalMajor = cartSubtotalMajor + selected.amountMajor

  return (
    <ScrollView contentContainerStyle={{ padding: theme.spacing(2), gap: theme.spacing(1.5) }}>
      <Text style={[theme.typography.heading, { color: theme.colors.text }]}>Shipping method</Text>

      {methods.map((method) => {
        const isSelected = method.id === selected.id
        return (
          <Card key={method.id} style={isSelected ? { borderColor: theme.colors.primary, borderWidth: 2 } : undefined}>
            <View style={styles.row} accessible accessibilityRole="radio" accessibilityState={{ selected: isSelected }}>
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.subheading, { color: theme.colors.text }]}>{method.name}</Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                  Estimated {method.estimatedTransitDays} day{method.estimatedTransitDays === 1 ? '' : 's'}
                </Text>
              </View>
              <PriceText amountMajor={method.amountMajor} currencyCode={method.currencyCode} />
            </View>
            <View style={{ marginTop: theme.spacing(1) }}>
              <Button
                title={isSelected ? 'Selected' : 'Select'}
                variant={isSelected ? 'primary' : 'secondary'}
                onPress={() => setSelectedId(method.id)}
              />
            </View>
          </Card>
        )
      })}

      <Card>
        <View style={styles.row}>
          <Text style={[theme.typography.subheading, { color: theme.colors.text }]}>Estimated total</Text>
          <PriceText amountMajor={estimatedTotalMajor} currencyCode={selected.currencyCode} />
        </View>
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
          Final total (including tax) is confirmed on the next screen.
        </Text>
      </Card>

      <Button
        title="Continue to payment"
        onPress={() => {
          session.setShippingMethod(selected)
          navigation.navigate('Payment')
        }}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
})
