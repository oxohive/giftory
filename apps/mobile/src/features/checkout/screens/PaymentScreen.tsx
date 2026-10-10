import { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import RazorpayCheckout from 'react-native-razorpay'
import type { RazorpayCheckoutSuccess } from 'react-native-razorpay'
import type { CheckoutStackParamList } from '../../../navigation/types'
import { env } from '../../../lib/api/env'
import { ApiError } from '../../../lib/api/errors'
import { openPaymentSession, placeOrder } from '../../../lib/api/checkout'
import type { PlacedOrder } from '../../../lib/api/checkout'
import { newIdempotencyKey } from '../../../lib/api/idempotency'
import { toMinorUnits } from '../../../lib/api/money'
import { confirmRazorpayPayment } from '../../../lib/api/payments'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { ErrorState } from '../../../components/ui/ErrorState'
import { PriceText } from '../../../components/ui/PriceText'
import { useTheme } from '../../../theme'
import { useCheckoutSession } from '../hooks/useCheckoutSession'

type Props = NativeStackScreenProps<CheckoutStackParamList, 'Payment'>

/**
 * Deep-link placeholders required by `PlaceOrderInput`/`openPaymentSession`'s
 * request body (a contract shared with the web storefront's redirect-based
 * flow). The native Razorpay SDK never actually navigates to these — its
 * success/failure is reported back to this screen directly via
 * `RazorpayCheckout.open()`'s resolved/rejected promise — but the backend
 * still requires non-empty URL strings on both calls.
 */
const SUCCESS_URL = 'giftory://checkout/success'
const CANCEL_URL = 'giftory://checkout/cancel'

/**
 * Resolves the Razorpay `order_id` for `RazorpayCheckout.open()`.
 *
 * The task spec's literal mapping reads `paymentSession.sessionId` as the
 * Razorpay order id. That does NOT hold up against the one live-verified
 * reference in this codebase: apps/storefront's
 * `razorpayConfigFromSession()` (apps/storefront/src/lib/api/payments.ts)
 * shows the real Razorpay order id lives at `providerData.razorpayOrderId`
 * (falling back to `providerData.orderId`) — `sessionId` is the backend's
 * own internal payment-session/transaction id, a different value. This
 * function follows that verified mapping; `sessionId` is kept only as a
 * last-resort fallback in case `providerData` is ever missing, and should be
 * re-verified against a live mobile backend response before shipping.
 */
function resolveRazorpayOrderId(order: PlacedOrder): string {
  const providerData = order.payment.providerData as Record<string, unknown> | undefined
  const fromProviderData = providerData?.razorpayOrderId ?? providerData?.orderId
  if (typeof fromProviderData === 'string' && fromProviderData.length > 0) return fromProviderData
  return order.payment.sessionId
}

/**
 * Resolves the Razorpay amount in paise (integer minor units). The same
 * storefront reference shows the backend already returns this pre-computed
 * in `providerData.amountMinor` (or `.amount`); fall back to converting the
 * order's own grand total only if `providerData` doesn't carry it.
 */
function resolveRazorpayAmountMinor(order: PlacedOrder): number {
  const providerData = order.payment.providerData as Record<string, unknown> | undefined
  const fromProviderData = providerData?.amountMinor ?? providerData?.amount
  if (typeof fromProviderData === 'number' && Number.isFinite(fromProviderData)) return fromProviderData
  return toMinorUnits(order.totals.grandTotalMajor)
}

function buildRazorpayOptions(order: PlacedOrder) {
  return {
    key: env.razorpayKeyId, // Key ID only, from TASK-03's env.ts — NEVER the secret.
    order_id: resolveRazorpayOrderId(order),
    amount: resolveRazorpayAmountMinor(order),
    currency: order.currencyCode,
    name: 'Giftory',
    description: `Order ${order.orderNumber}`,
  }
}

type ErrorKind = 'ambiguous' | 'declined' | 'validation'

interface PaymentError {
  kind: ErrorKind
  message: string
}

const AMBIGUOUS_MESSAGE =
  "We couldn't confirm this step with the server. If you were charged, it will show up in your Order history shortly — please check there before trying again."

/** Classifies a thrown error from placeOrder/openPaymentSession/confirmRazorpayPayment. */
function describeOrderError(err: unknown): PaymentError {
  if (err instanceof ApiError) {
    if (err.status >= 500) {
      return { kind: 'ambiguous', message: AMBIGUOUS_MESSAGE }
    }
    return { kind: 'validation', message: err.message }
  }
  // Not an ApiError -> most likely a raw network failure (fetch rejected
  // before a response was ever received). We genuinely don't know whether
  // the backend processed the request, so treat it as ambiguous too.
  return { kind: 'ambiguous', message: AMBIGUOUS_MESSAGE }
}

function describeRazorpayRejection(err: unknown): string {
  if (err && typeof err === 'object' && 'description' in err) {
    const description = (err as { description?: unknown }).description
    if (typeof description === 'string' && description.length > 0) return description
  }
  return 'Payment was cancelled or declined. You can try again.'
}

export default function PaymentScreen({ navigation }: Props) {
  const theme = useTheme()
  const session = useCheckoutSession()
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<PaymentError | null>(null)

  const address = session.address
  const shippingMethod = session.shippingMethod

  /** Opens the native Razorpay checkout for an order that already has an open payment session. */
  const payWithRazorpay = useCallback(
    async (order: PlacedOrder) => {
      let success: RazorpayCheckoutSuccess
      try {
        success = await RazorpayCheckout.open(buildRazorpayOptions(order))
      } catch (razorpayError) {
        // The user cancelled the modal, or Razorpay itself declined the
        // payment — no charge has gone through, so retrying on the SAME
        // order via openPaymentSession (not a new placeOrder) is safe.
        setWorking(false)
        setError({ kind: 'declined', message: describeRazorpayRejection(razorpayError) })
        return
      }

      try {
        await confirmRazorpayPayment(
          {
            razorpay_order_id: success.razorpay_order_id,
            razorpay_payment_id: success.razorpay_payment_id,
            razorpay_signature: success.razorpay_signature,
          },
          newIdempotencyKey(),
        )
      } catch (confirmError) {
        // Razorpay reported success but our own confirm/HMAC-verify step
        // failed (e.g. gateway 502) — money may already have moved. Do not
        // silently retry placeOrder or re-open a new payment session here.
        setWorking(false)
        setError(describeOrderError(confirmError))
        return
      }

      setWorking(false)
      navigation.replace('Confirmation', { orderId: order.orderId })
    },
    [navigation],
  )

  /** First attempt: creates the order (reusing this attempt's idempotency key on any retry). */
  const handlePlaceOrderAndPay = useCallback(async () => {
    if (!address || !shippingMethod) {
      navigation.replace('Address')
      return
    }
    setWorking(true)
    setError(null)
    try {
      const order = await placeOrder(
        {
          email: session.email,
          currencyCode: 'INR',
          shippingAddress: address,
          billingSameAsShipping: true,
          shippingMethodCode: shippingMethod.code,
          paymentProvider: 'razorpay',
          successUrl: SUCCESS_URL,
          cancelUrl: CANCEL_URL,
        },
        session.orderIdempotencyKey,
      )
      session.setOrder(order)
      await payWithRazorpay(order)
    } catch (err) {
      setWorking(false)
      setError(describeOrderError(err))
    }
  }, [address, shippingMethod, session, payWithRazorpay, navigation])

  /** Retry attempt after a declined/cancelled payment: reopens a session on the SAME order. */
  const handleRetryPaymentOnSameOrder = useCallback(async () => {
    if (!session.order) {
      await handlePlaceOrderAndPay()
      return
    }
    setWorking(true)
    setError(null)
    try {
      const refreshed = await openPaymentSession(
        session.order.orderId,
        { paymentProvider: 'razorpay', successUrl: SUCCESS_URL, cancelUrl: CANCEL_URL },
        newIdempotencyKey(),
      )
      session.setOrder(refreshed)
      await payWithRazorpay(refreshed)
    } catch (err) {
      setWorking(false)
      setError(describeOrderError(err))
    }
  }, [session, payWithRazorpay, handlePlaceOrderAndPay])

  if (!address || !shippingMethod) {
    return (
      <ErrorState
        message="We need your address and shipping method before payment."
        onRetry={() => navigation.replace('Address')}
      />
    )
  }

  const hasOpenOrder = Boolean(session.order)
  const payAction = hasOpenOrder ? handleRetryPaymentOnSameOrder : handlePlaceOrderAndPay
  const payLabel = hasOpenOrder ? 'Retry payment' : 'Pay now'

  return (
    <ScrollView contentContainerStyle={{ padding: theme.spacing(2), gap: theme.spacing(1.5) }}>
      <Text style={[theme.typography.heading, { color: theme.colors.text }]}>Review & pay</Text>

      <Card>
        <Text style={[theme.typography.subheading, { color: theme.colors.text }]}>Deliver to</Text>
        <Text style={[theme.typography.body, { color: theme.colors.text, marginTop: 4 }]}>{address.fullName}</Text>
        <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
          {address.line1}
          {address.line2 ? `, ${address.line2}` : ''}
        </Text>
        <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
          {address.city}, {address.state} {address.postalCode}
        </Text>
        <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>{address.phone}</Text>
      </Card>

      <Card>
        <View style={styles.row}>
          <Text style={[theme.typography.subheading, { color: theme.colors.text }]}>{shippingMethod.name}</Text>
          <PriceText amountMajor={shippingMethod.amountMajor} currencyCode={shippingMethod.currencyCode} />
        </View>
      </Card>

      {session.order ? (
        <Card>
          <View style={styles.row}>
            <Text style={[theme.typography.subheading, { color: theme.colors.text }]}>Order total</Text>
            <PriceText amountMajor={session.order.totals.grandTotalMajor} currencyCode={session.order.currencyCode} />
          </View>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
            Order {session.order.orderNumber}
          </Text>
        </Card>
      ) : null}

      {error ? (
        <ErrorState message={error.message} onRetry={payAction} />
      ) : (
        <Button title={payLabel} onPress={payAction} loading={working} disabled={working} />
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
})
