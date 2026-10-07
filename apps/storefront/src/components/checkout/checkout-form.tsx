'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CreditCard, Gift, Loader2, Lock, MapPin, Smartphone, Truck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Price } from '@/components/catalog/price'
import { StateMessage } from '@/components/state-message'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { describedBy, Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioCard, RadioGroup } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { addressesApi, addressSchema, formatAddress, type AddressInput } from '@/lib/api/addresses'
import { cartErrorMessage, cartIssuesFromError, describeLineIssue, isTransientError } from '@/lib/api/cart'
import { checkoutApi, checkoutErrorCode, orderFromCheckoutError, type PaymentProvider, type PlacedOrder } from '@/lib/api/checkout'
import { newIdempotencyKey } from '@/lib/api/http'
import {
  loadRazorpayScript,
  openRazorpayCheckout,
  paymentsApi,
  razorpayConfigFromSession,
  stripeConfigFromSession,
  type StripeClientConfig,
} from '@/lib/api/payments'
import { useCustomer } from '@/lib/auth/use-customer'
import { CART_QUERY_KEY, useCart } from '@/lib/cart/cart-context'
import { readCheckoutSession, useCheckoutSession, writeCheckoutSession, type PendingOrder } from '@/lib/checkout/checkout-session'
import { publicEnv } from '@/lib/env.public'
import { StripePayment } from './stripe-payment'
import { AddressFields } from './address-fields'

const emptyAddress: AddressInput = {
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'IN',
}

const checkoutSchema = z
  .object({
    email: z.string().trim().email('Enter a valid email for your receipt'),
    addressMode: z.enum(['saved', 'new']),
    savedAddressId: z.string().optional(),
    address: z.unknown(),
    saveAddress: z.boolean(),
    shippingMethodCode: z.string().min(1, 'Choose a delivery option'),
    paymentProvider: z.enum(['stripe', 'razorpay']),
    acceptTerms: z.literal(true, { error: 'Please accept the terms to continue' }),
  })
  .superRefine((value, ctx) => {
    if (value.addressMode === 'saved') {
      if (!value.savedAddressId) ctx.addIssue({ code: 'custom', path: ['savedAddressId'], message: 'Choose an address' })
      return
    }
    const parsed = addressSchema.safeParse(value.address)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ code: 'custom', path: ['address', ...issue.path.map(String)], message: issue.message })
      }
    }
  })

type CheckoutValues = Omit<z.input<typeof checkoutSchema>, 'address' | 'acceptTerms'> & {
  address: AddressInput
  acceptTerms: boolean
}

type PaymentStage =
  | { kind: 'idle' }
  | { kind: 'stripe'; pending: PendingOrder; config: StripeClientConfig }
  | { kind: 'processing'; message: string }

/** Success/cancel URLs for the gateway; the backend substitutes `{orderId}`. */
function returnUrls(provider: PaymentProvider) {
  return {
    successUrl: `${publicEnv.siteUrl}/order/{orderId}/confirmation?provider=${provider}`,
    cancelUrl: `${publicEnv.siteUrl}/checkout?cancelled=1`,
  }
}

function orderLabel(order: { orderNumber: string | null; orderId: string }) {
  return order.orderNumber ?? order.orderId.slice(0, 8)
}

/** Moves focus to a stage heading when it appears (screen readers announce the new step). */
function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return ref
}

function PaymentProviderOptions({ value, onChange, idPrefix }: { value: PaymentProvider; onChange: (value: PaymentProvider) => void; idPrefix: string }) {
  return (
    <RadioGroup aria-label="Payment method" value={value} onValueChange={(v) => onChange(v as PaymentProvider)}>
      <RadioCard id={`${idPrefix}-razorpay`} value="razorpay">
        <span className="flex items-center gap-2 font-medium">
          <Smartphone className="size-4" aria-hidden="true" /> UPI, cards, net banking &amp; wallets
        </span>
        <span className="text-sm text-muted-foreground">Secure checkout by Razorpay</span>
      </RadioCard>
      <RadioCard id={`${idPrefix}-stripe`} value="stripe">
        <span className="flex items-center gap-2 font-medium">
          <CreditCard className="size-4" aria-hidden="true" /> Credit or debit card
        </span>
        <span className="text-sm text-muted-foreground">Secure checkout by Stripe</span>
      </RadioCard>
    </RadioGroup>
  )
}

/** An order exists but isn't paid: retry payment on it (never place a second order). */
function PendingPaymentPanel({
  pending,
  error,
  busy,
  onPay,
  onAbandon,
}: {
  pending: PendingOrder
  error: string | null
  busy: boolean
  onPay: (provider: PaymentProvider) => void
  onAbandon: () => void
}) {
  const [provider, setProvider] = useState<PaymentProvider>(pending.provider)
  const headingRef = useFocusOnMount<HTMLHeadingElement>()
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <h2 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-xl font-semibold outline-none">
          <Lock className="size-5 text-primary" aria-hidden="true" /> Complete your payment
        </h2>
        <p className="text-sm text-muted-foreground">
          Order {orderLabel(pending)} is saved but hasn’t been paid yet
          {pending.grandTotalMinor !== null ? (
            <>
              {' '}
              · <Price minor={pending.grandTotalMinor} currency={pending.currency} />
            </>
          ) : null}
          .
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error ? (
          <Alert tone="error" title="Payment not completed">
            {error}
          </Alert>
        ) : null}
        <PaymentProviderOptions value={provider} onChange={setProvider} idPrefix="retry-pay" />
        <Button size="lg" onClick={() => onPay(provider)} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Lock aria-hidden="true" />}
          {busy ? 'Opening payment…' : 'Pay now'}
        </Button>
        <p className="text-xs text-muted-foreground">
          You won’t be charged twice: paying again uses the same order.{' '}
          <button type="button" onClick={onAbandon} className="font-medium text-primary underline-offset-4 hover:underline">
            Leave this order unpaid and start over
          </button>
        </p>
      </CardContent>
    </Card>
  )
}

export function CheckoutForm() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const cart = useCart()
  const customer = useCustomer()
  const session = useCheckoutSession()
  const pendingOrder = session.state.pendingOrder
  const [stage, setStage] = useState<PaymentStage>({ kind: 'idle' })
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const addresses = useQuery({ queryKey: ['addresses'], queryFn: () => addressesApi.list() })

  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<CheckoutValues>({
    // The superRefine'd schema validates `address` as AddressInput when addressMode === 'new'.
    resolver: zodResolver(checkoutSchema) as never,
    defaultValues: {
      email: '',
      addressMode: 'new',
      address: emptyAddress,
      saveAddress: true,
      shippingMethodCode: '',
      paymentProvider: 'razorpay',
      acceptTerms: false,
    },
  })

  // Prefill email from the signed-in customer.
  useEffect(() => {
    const email = customer.data?.user.email
    if (email && !getValues('email')) setValue('email', email)
  }, [customer.data, getValues, setValue])

  // Prefer the default saved address once addresses load.
  useEffect(() => {
    const items = addresses.data?.items ?? []
    if (items.length && !getValues('savedAddressId')) {
      const preferred = items.find((a) => a.isDefault) ?? items[0]
      if (preferred) {
        setValue('addressMode', 'saved')
        setValue('savedAddressId', preferred.id)
      }
    }
  }, [addresses.data, getValues, setValue])

  const addressMode = useWatch({ control, name: 'addressMode' })
  const savedAddressId = useWatch({ control, name: 'savedAddressId' })
  const postalCode = useWatch({ control, name: 'address.postalCode' })
  const shippingMethodCode = useWatch({ control, name: 'shippingMethodCode' })
  const paymentProvider = useWatch({ control, name: 'paymentProvider' })

  const selectedSaved = addresses.data?.items.find((a) => a.id === savedAddressId) ?? null
  const effectivePostal = addressMode === 'saved' ? selectedSaved?.postalCode : postalCode
  const pinForQuote = effectivePostal && /^[1-9]\d{5}$/.test(effectivePostal) ? effectivePostal : undefined

  // The backend prices delivery from the server cart; subtotal/itemCount are only its fallback.
  const shipping = useQuery({
    queryKey: ['shipping-methods', cart.subtotalMinor, cart.itemCount, pinForQuote],
    queryFn: () => checkoutApi.shippingMethods({ subtotalMinor: cart.subtotalMinor, itemCount: cart.itemCount, postalCode: pinForQuote }),
    enabled: cart.ready && cart.lines.length > 0 && !pendingOrder,
  })

  useEffect(() => {
    const methods = shipping.data ?? []
    if (methods.length && !methods.some((m) => m.code === shippingMethodCode)) {
      setValue('shippingMethodCode', methods[0]!.code)
    }
  }, [shipping.data, shippingMethodCode, setValue])

  // Warm up Razorpay Checkout.js as soon as it's selected.
  useEffect(() => {
    if (paymentProvider === 'razorpay' || pendingOrder?.provider === 'razorpay') loadRazorpayScript().catch(() => undefined)
  }, [paymentProvider, pendingOrder?.provider])

  const selectedShipping = shipping.data?.find((m) => m.code === shippingMethodCode) ?? null
  const estimatedTotal = cart.subtotalMinor + (selectedShipping?.priceMinor ?? 0)
  const hasWrap = useMemo(() => cart.lines.some((l) => l.gift.giftWrap), [cart.lines])

  const goToConfirmation = (orderId: string, provider: PaymentProvider, processing = false) => {
    writeCheckoutSession((prev) => ({ ...prev, orderKey: null, uncertain: false, pendingOrder: null }))
    void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY })
    router.push(
      `/order/${encodeURIComponent(orderId)}/confirmation?provider=${provider}${processing ? '&redirect_status=processing' : ''}`,
    )
  }

  /** The payment session was used up (dismissed, failed, unusable): the next attempt asks for a new one. */
  const paymentNotCompleted = (message: string) => {
    writeCheckoutSession((prev) => (prev.pendingOrder ? { ...prev, pendingOrder: { ...prev.pendingOrder, paymentKey: null } } : prev))
    setStage({ kind: 'idle' })
    setPaymentError(message)
  }

  /** Hand a payment session (from order placement or a payment retry) to the chosen gateway. */
  const startPayment = async (placed: PlacedOrder, pending: PendingOrder) => {
    setPaymentError(null)
    if (pending.provider === 'stripe') {
      const config = stripeConfigFromSession(placed.payment)
      if (!config) {
        paymentNotCompleted('Card payments are not available right now. Please choose another payment method.')
        return
      }
      setStage({ kind: 'stripe', pending, config })
      return
    }
    const config = razorpayConfigFromSession(placed.payment)
    if (!config) {
      paymentNotCompleted('Razorpay is not available right now. Please choose card payment.')
      return
    }
    let result
    try {
      await loadRazorpayScript()
      result = await openRazorpayCheckout(config, {
        orderLabel: `Order ${orderLabel(pending)}`,
        email: pending.email,
        name: pending.contactName,
        contact: pending.contactPhone,
      })
    } catch (error) {
      paymentNotCompleted(error instanceof Error ? error.message : 'Payment failed. Please try again.')
      return
    }
    // Checkout.js handler: verify the signature server-side before leaving the page.
    setStage({ kind: 'processing', message: 'Confirming your payment…' })
    try {
      await paymentsApi.confirmRazorpay(placed.payment.transactionId, result)
      goToConfirmation(pending.orderId, 'razorpay')
    } catch (error) {
      if (isTransientError(error)) {
        // Razorpay has the payment; the gateway webhook settles it even if confirm didn't get through.
        goToConfirmation(pending.orderId, 'razorpay', true)
        return
      }
      paymentNotCompleted(
        `We couldn’t verify your payment (${error instanceof Error ? error.message : 'unknown error'}). If money was deducted, it will be matched to order ${orderLabel(pending)} automatically — please don’t pay again before checking your email.`,
      )
    }
  }

  const placeOrder = useMutation({
    mutationFn: async (values: CheckoutValues) => {
      const shippingAddress =
        values.addressMode === 'saved' ? (addresses.data?.items.find((a) => a.id === values.savedAddressId) ?? null) : values.address
      if (!shippingAddress) throw new Error('Choose a delivery address')

      // One Idempotency-Key per checkout attempt, kept in sessionStorage across retries and reloads.
      const current = readCheckoutSession()
      const idempotencyKey = current.orderKey ?? newIdempotencyKey('order')
      if (!current.orderKey) writeCheckoutSession((prev) => ({ ...prev, orderKey: idempotencyKey }))

      const base = {
        email: values.email.trim(),
        contactName: shippingAddress.fullName,
        contactPhone: shippingAddress.phone,
        provider: values.paymentProvider,
        paymentKey: null,
      }
      try {
        const placed = await checkoutApi.placeOrder(
          {
            email: values.email,
            shippingAddress: {
              fullName: shippingAddress.fullName,
              phone: shippingAddress.phone,
              line1: shippingAddress.line1,
              line2: shippingAddress.line2 ?? '',
              city: shippingAddress.city,
              state: shippingAddress.state,
              postalCode: shippingAddress.postalCode,
              country: 'IN',
            },
            billingSameAsShipping: true,
            billingAddress: null,
            shippingMethodCode: values.shippingMethodCode,
            paymentProvider: values.paymentProvider,
            ...returnUrls(values.paymentProvider),
          },
          idempotencyKey,
        )
        const pending: PendingOrder = {
          ...base,
          orderId: placed.orderId,
          orderNumber: placed.orderNumber,
          grandTotalMinor: placed.grandTotalMinor,
          currency: placed.currency,
        }
        return { kind: 'placed' as const, placed, pending }
      } catch (error) {
        const existing = orderFromCheckoutError(error)
        if (existing?.code === 'payment_session_failed') {
          const pending: PendingOrder = { ...base, orderId: existing.orderId, orderNumber: existing.orderNumber, grandTotalMinor: null, currency: 'INR' }
          return { kind: 'session_failed' as const, pending, message: error instanceof Error ? error.message : 'We could not start the payment.' }
        }
        if (existing?.code === 'order_already_paid') return { kind: 'paid' as const, orderId: existing.orderId, provider: values.paymentProvider }

        const code = checkoutErrorCode(error)
        if (code === 'idempotency_key_reused') {
          // The details changed after an earlier attempt with this key: start a fresh attempt.
          writeCheckoutSession((prev) => ({ ...prev, orderKey: null, uncertain: false }))
          throw new Error('Your details changed since your last attempt. Please check them and place your order again.')
        }
        if (code === 'cart_empty' && current.uncertain) {
          throw new Error(
            'We may already have received your order: the last attempt was interrupted and your cart has since been checked out. Please check your email or your orders before trying again.',
          )
        }
        if (code === 'cart_invalid') {
          void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY })
          const issues = cartIssuesFromError(error)
          if (issues.length) throw new Error(`Some items in your cart need attention. ${cartErrorMessage(error)}`)
        }
        if (code === 'checkout_in_progress') throw new Error('Your order is still being processed. Please wait a moment and try again.')
        // No definite answer (network/5xx): an order may exist. The same key is reused on retry.
        if (isTransientError(error)) writeCheckoutSession((prev) => ({ ...prev, uncertain: true }))
        throw error
      }
    },
    onSuccess: async (result, values) => {
      if (result.kind === 'paid') {
        goToConfirmation(result.orderId, result.provider)
        return
      }
      // The order exists: the attempt is over (fresh key next time) and the server cart is closed.
      writeCheckoutSession((prev) => ({ ...prev, orderKey: null, uncertain: false, pendingOrder: result.pending }))
      void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY })
      if (values.addressMode === 'new' && values.saveAddress && customer.data) {
        void addressesApi
          .create(values.address)
          .then(() => queryClient.invalidateQueries({ queryKey: ['addresses'] }))
          .catch(() => undefined)
      }
      if (result.kind === 'session_failed') {
        paymentNotCompleted(result.message)
        return
      }
      await startPayment(result.placed, result.pending)
    },
  })

  const retryPayment = useMutation({
    mutationFn: async (provider: PaymentProvider) => {
      const pending = readCheckoutSession().pendingOrder
      if (!pending) throw new Error('There is no unpaid order to pay for.')
      // Reuse the key while the same request is retried (e.g. after a network error).
      const paymentKey = pending.provider === provider && pending.paymentKey ? pending.paymentKey : newIdempotencyKey('pay')
      const next: PendingOrder = { ...pending, provider, paymentKey }
      writeCheckoutSession((prev) => ({ ...prev, pendingOrder: next }))
      try {
        const placed = await checkoutApi.retryPayment(pending.orderId, { paymentProvider: provider, ...returnUrls(provider) }, paymentKey)
        const updated: PendingOrder = {
          ...next,
          orderNumber: placed.orderNumber ?? next.orderNumber,
          grandTotalMinor: placed.grandTotalMinor,
          currency: placed.currency,
        }
        return { kind: 'session' as const, placed, pending: updated }
      } catch (error) {
        const code = checkoutErrorCode(error)
        if (code === 'order_already_paid') return { kind: 'paid' as const, orderId: pending.orderId, provider }
        if (code === 'idempotency_key_reused') {
          writeCheckoutSession((prev) => (prev.pendingOrder ? { ...prev, pendingOrder: { ...prev.pendingOrder, paymentKey: null } } : prev))
          throw new Error('Please try again.')
        }
        if (code === 'order_not_found') {
          throw new Error(
            `We couldn’t reopen payment for order ${orderLabel(pending)} here. Sign in to the account you used, or contact us with your order number.`,
          )
        }
        throw error
      }
    },
    onSuccess: async (result) => {
      if (result.kind === 'paid') {
        goToConfirmation(result.orderId, result.provider)
        return
      }
      writeCheckoutSession((prev) => ({ ...prev, pendingOrder: result.pending }))
      await startPayment(result.placed, result.pending)
    },
    onError: (error) => setPaymentError(error instanceof Error ? error.message : 'Payment could not be started. Please try again.'),
  })

  const abandonPendingOrder = () => {
    writeCheckoutSession((prev) => ({ ...prev, orderKey: null, uncertain: false, pendingOrder: null }))
    setPaymentError(null)
    setStage({ kind: 'idle' })
    router.push('/cart')
  }

  if (!cart.ready || !session.ready) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          Loading checkout…
        </span>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (stage.kind === 'stripe') {
    return (
      <StripeStage
        pending={stage.pending}
        config={stage.config}
        onSucceeded={() => goToConfirmation(stage.pending.orderId, 'stripe')}
        onChangeMethod={() => {
          writeCheckoutSession((prev) => (prev.pendingOrder ? { ...prev, pendingOrder: { ...prev.pendingOrder, paymentKey: null } } : prev))
          setStage({ kind: 'idle' })
        }}
      />
    )
  }

  if (stage.kind === 'processing') {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-16 text-center">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
        <p className="font-medium">{stage.message}</p>
        <p className="text-sm text-muted-foreground">Please don’t close this page.</p>
      </div>
    )
  }

  if (pendingOrder) {
    return (
      <PendingPaymentPanel
        key={pendingOrder.orderId}
        pending={pendingOrder}
        error={paymentError}
        busy={retryPayment.isPending}
        onPay={(provider) => {
          setPaymentError(null)
          retryPayment.mutate(provider)
        }}
        onAbandon={abandonPendingOrder}
      />
    )
  }

  if (cart.isError) {
    return (
      <StateMessage
        kind="error"
        title="We couldn’t load your cart"
        action={
          <Button variant="outline" onClick={cart.refetch}>
            Try again
          </Button>
        }
      >
        {cart.error instanceof Error ? cart.error.message : 'Please try again.'}
      </StateMessage>
    )
  }

  if (cart.lines.length === 0) {
    return (
      <StateMessage
        title="Your cart is empty"
        action={
          <Button asChild>
            <Link href="/products">Find a gift</Link>
          </Button>
        }
      >
        Add a gift to your cart to check out.
      </StateMessage>
    )
  }

  const savedItems = addresses.data?.items ?? []
  const blocked = cart.hasIssues || cart.isSyncing

  return (
    <form onSubmit={handleSubmit((values) => placeOrder.mutate(values))} noValidate className="grid gap-8 lg:grid-cols-[1fr_24rem]">
      <div className="grid content-start gap-6">
        <Card>
          <CardHeader>
            <CardTitle>1. Contact</CardTitle>
            {!customer.data ? (
              <p className="text-sm text-muted-foreground">
                Have an account?{' '}
                <Link href="/account/login?next=/checkout" className="font-medium text-primary hover:underline">
                  Sign in
                </Link>{' '}
                for faster checkout.
              </p>
            ) : null}
          </CardHeader>
          <CardContent>
            <Field id="email" label="Email" required error={errors.email?.message} hint="We’ll send your receipt and tracking here.">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={describedBy('email', errors.email?.message, true)}
                {...register('email')}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-5 text-primary" aria-hidden="true" /> 2. Delivery address
            </CardTitle>
            {addresses.data?.source === 'device' && savedItems.length > 0 ? (
              <p className="text-xs text-muted-foreground">Saved addresses are stored on this device.</p>
            ) : null}
          </CardHeader>
          <CardContent className="grid gap-4">
            {addresses.isLoading ? <Skeleton className="h-20 w-full" /> : null}
            {savedItems.length > 0 ? (
              <Controller
                control={control}
                name="savedAddressId"
                render={({ field }) => (
                  <RadioGroup
                    aria-label="Saved addresses"
                    value={addressMode === 'saved' ? (field.value ?? '') : 'new'}
                    onValueChange={(value) => {
                      if (value === 'new') {
                        setValue('addressMode', 'new')
                      } else {
                        setValue('addressMode', 'saved')
                        field.onChange(value)
                      }
                    }}
                  >
                    {savedItems.map((a) => (
                      <RadioCard key={a.id} id={`addr-${a.id}`} value={a.id}>
                        <span className="font-medium">{a.fullName}</span>
                        <span className="text-sm text-muted-foreground">{formatAddress(a)}</span>
                        <span className="text-sm text-muted-foreground">{a.phone}</span>
                      </RadioCard>
                    ))}
                    <RadioCard id="addr-new" value="new">
                      <span className="font-medium">Deliver to a new address</span>
                    </RadioCard>
                  </RadioGroup>
                )}
              />
            ) : null}
            {errors.savedAddressId ? (
              <p role="alert" className="text-xs font-medium text-danger">
                {errors.savedAddressId.message}
              </p>
            ) : null}
            {addressMode === 'new' ? (
              <>
                <AddressFields idPrefix="ship" prefix="address" register={register} errors={errors.address} />
                {customer.data ? (
                  <Controller
                    control={control}
                    name="saveAddress"
                    render={({ field }) => (
                      <div className="flex items-center gap-3">
                        <Checkbox id="save-address" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                        <label htmlFor="save-address" className="text-sm">
                          Save this address for next time
                        </label>
                      </div>
                    )}
                  />
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="size-5 text-primary" aria-hidden="true" /> 3. Delivery option
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {shipping.isLoading ? <Skeleton className="h-16 w-full" /> : null}
            {shipping.isError ? (
              <Alert tone="error" title="Couldn’t load delivery options">
                {shipping.error instanceof Error ? shipping.error.message : 'Please try again.'}
              </Alert>
            ) : null}
            {shipping.data?.some((m) => m.estimated) ? (
              <Alert tone="warning" title="Estimated delivery charges">
                Live delivery rates aren’t connected yet; the final charge is confirmed when your order is placed.
              </Alert>
            ) : null}
            {shipping.data ? (
              <Controller
                control={control}
                name="shippingMethodCode"
                render={({ field }) => (
                  <RadioGroup aria-label="Delivery options" value={field.value} onValueChange={field.onChange}>
                    {shipping.data.map((m) => (
                      <RadioCard key={m.code} id={`ship-${m.code}`} value={m.code}>
                        <span className="flex justify-between gap-2 font-medium">
                          {m.name}
                          <span className="tabular-nums">{m.priceMinor === 0 ? 'Free' : <Price minor={m.priceMinor} />}</span>
                        </span>
                        {m.description ? <span className="text-sm text-muted-foreground">{m.description}</span> : null}
                      </RadioCard>
                    ))}
                  </RadioGroup>
                )}
              />
            ) : null}
            {errors.shippingMethodCode ? (
              <p role="alert" className="text-xs font-medium text-danger">
                {errors.shippingMethodCode.message}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-5 text-primary" aria-hidden="true" /> 4. Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Controller
              control={control}
              name="paymentProvider"
              render={({ field }) => <PaymentProviderOptions value={field.value} onChange={field.onChange} idPrefix="pay" />}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid h-fit gap-4 lg:sticky lg:top-24">
        <Card>
          <CardHeader>
            <CardTitle>Order summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ul className="grid gap-3 text-sm">
              {cart.lines.map((line) => (
                <li key={line.id} className="flex justify-between gap-3">
                  <span>
                    {line.title}
                    {line.variantName ? <span className="text-muted-foreground"> · {line.variantName}</span> : null}
                    <span className="text-muted-foreground"> × {line.quantity}</span>
                    {line.gift.giftWrap ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Gift className="size-3" aria-hidden="true" /> Gift wrapped
                      </span>
                    ) : null}
                    {line.issue ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-danger">
                        <AlertTriangle className="size-3" aria-hidden="true" /> {describeLineIssue(line.issue)}
                      </span>
                    ) : null}
                  </span>
                  <Price minor={line.totalMinor} fallback="—" className="shrink-0" />
                </li>
              ))}
            </ul>
            <dl className="grid gap-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>
                  <Price minor={cart.subtotalMinor} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Delivery</dt>
                <dd>{selectedShipping ? selectedShipping.priceMinor === 0 ? 'Free' : <Price minor={selectedShipping.priceMinor} /> : '—'}</dd>
              </div>
              {hasWrap ? (
                <div className="flex justify-between">
                  <dt>Gift wrap</dt>
                  <dd>Included</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd>
                  <Price minor={estimatedTotal} />
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {cart.isSyncing ? 'Updating your cart…' : 'Prices include GST. The final amount is confirmed by our server before payment.'}
            </p>
            {cart.hasIssues ? (
              <Alert tone="warning" title="Some items need your attention">
                <Link href="/cart" className="font-medium text-primary hover:underline">
                  Review your cart
                </Link>{' '}
                and remove or change the highlighted items to continue.
              </Alert>
            ) : null}
            <Controller
              control={control}
              name="acceptTerms"
              render={({ field }) => (
                <div className="grid gap-1">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="accept-terms"
                      checked={field.value}
                      onCheckedChange={(c) => field.onChange(c === true)}
                      aria-invalid={Boolean(errors.acceptTerms)}
                      aria-describedby={errors.acceptTerms ? 'accept-terms-error' : undefined}
                    />
                    <label htmlFor="accept-terms" className="text-sm">
                      I agree to the terms of sale and the refund policy.
                    </label>
                  </div>
                  {errors.acceptTerms ? (
                    <p id="accept-terms-error" role="alert" className="text-xs font-medium text-danger">
                      {errors.acceptTerms.message}
                    </p>
                  ) : null}
                </div>
              )}
            />
            {placeOrder.isError ? (
              <Alert tone="error" title="We couldn’t place your order">
                {placeOrder.error instanceof Error ? placeOrder.error.message : 'Please try again.'}
              </Alert>
            ) : null}
            <Button type="submit" size="lg" disabled={placeOrder.isPending || blocked}>
              {placeOrder.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Lock aria-hidden="true" />}
              {placeOrder.isPending ? 'Placing order…' : 'Place order & pay'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </form>
  )
}

function StripeStage({
  pending,
  config,
  onSucceeded,
  onChangeMethod,
}: {
  pending: PendingOrder
  config: StripeClientConfig
  onSucceeded: () => void
  onChangeMethod: () => void
}) {
  const headingRef = useFocusOnMount<HTMLHeadingElement>()
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <h2 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-xl font-semibold outline-none">
          <Lock className="size-5 text-primary" aria-hidden="true" /> Complete your payment
        </h2>
        <p className="text-sm text-muted-foreground">
          Order {orderLabel(pending)}
          {pending.grandTotalMinor !== null ? (
            <>
              {' '}
              · <Price minor={pending.grandTotalMinor} currency={pending.currency} />
            </>
          ) : null}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <StripePayment
          config={config}
          amountMinor={pending.grandTotalMinor ?? 0}
          returnUrl={`${publicEnv.siteUrl}/order/${encodeURIComponent(pending.orderId)}/confirmation?provider=stripe`}
          onSucceeded={onSucceeded}
        />
        <Button variant="link" onClick={onChangeMethod}>
          Use a different payment method
        </Button>
      </CardContent>
    </Card>
  )
}
