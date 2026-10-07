'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Gift, Loader2, Minus, Plus, ShoppingBag } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { describedBy, Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { RadioCard, RadioGroup } from '@/components/ui/radio-group'
import { cartErrorMessage, MAX_LINE_QUANTITY } from '@/lib/api/cart'
import type { ProductDetail } from '@/lib/api/catalog.schemas'
import type { GiftProfile } from '@/lib/api/gift-catalog'
import { useCart } from '@/lib/cart/cart-context'
import { formatMoney } from '@/lib/money'

export function AddToCartForm({ product, giftProfile }: { product: ProductDetail; giftProfile: GiftProfile }) {
  const { addLine } = useCart()
  const [added, setAdded] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const maxQty = Math.min(MAX_LINE_QUANTITY, product.maxQty ?? MAX_LINE_QUANTITY)
  const messageMax = giftProfile.giftMessageMaxLength

  const schema = useMemo(
    () =>
      z.object({
        variantId: product.variants.length > 0 ? z.string().min(1, 'Choose an option') : z.string(),
        quantity: z.coerce
          .number<number>()
          .int()
          .min(product.minQty, `Minimum quantity is ${product.minQty}`)
          .max(maxQty, `Maximum quantity is ${maxQty}`),
        giftWrap: z.boolean(),
        giftMessage: z.string().max(messageMax, `Keep your message under ${messageMax} characters`),
      }),
    [product.variants.length, product.minQty, maxQty, messageMax],
  )
  type FormValues = z.infer<typeof schema>

  const defaultVariant = product.variants.find((v) => v.isDefault) ?? product.variants[0]
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { variantId: defaultVariant?.id ?? '', quantity: product.minQty, giftWrap: false, giftMessage: '' },
  })

  const variantId = useWatch({ control, name: 'variantId' })
  const quantity = useWatch({ control, name: 'quantity' })
  const message = useWatch({ control, name: 'giftMessage' }) ?? ''
  const variant = product.variants.find((v) => v.id === variantId) ?? null
  const unitPrice = variant?.priceMinor ?? product.priceMinor
  const purchasable = unitPrice !== null && !product.isQuoteOnly

  const onSubmit = async (values: FormValues) => {
    if (unitPrice === null) return
    setAdding(true)
    setAdded(false)
    setAddError(null)
    try {
      // The server re-prices and validates the line (gift wrap availability, message length, ...).
      await addLine({
        productId: product.id,
        variantId: variant?.id ?? null,
        quantity: values.quantity,
        giftWrap: giftProfile.giftWrapAvailable && values.giftWrap,
        giftMessage: values.giftMessage.trim() || null,
        slug: product.slug,
        title: product.title,
        variantName: variant && product.variants.length > 1 ? variant.name : null,
        imageUrl: variant?.imageUrl ?? product.imageUrl,
        unitPriceMinor: unitPrice,
        currency: product.currency,
        maxQuantity: maxQty,
        isCustomizable: giftProfile.isCustomizable,
      })
      setAdded(true)
    } catch (error) {
      setAddError(cartErrorMessage(error))
    } finally {
      setAdding(false)
    }
  }

  const stepQuantity = (delta: number) => {
    const current = Number(quantity) || product.minQty
    setValue('quantity', Math.max(product.minQty, Math.min(maxQty, current + delta)), { shouldValidate: true })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-6">
      <p className="text-3xl font-semibold">
        {unitPrice !== null ? (
          <span className="tabular-nums">{formatMoney(unitPrice, product.currency)}</span>
        ) : (
          <span className="text-muted-foreground">Price on request</span>
        )}
        <span className="ml-2 align-middle text-xs font-normal text-muted-foreground">incl. taxes</span>
      </p>

      {product.variants.length > 1 ? (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">Choose an option</legend>
          <Controller
            control={control}
            name="variantId"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                aria-describedby={errors.variantId ? 'variant-error' : undefined}
                className="grid-cols-1 sm:grid-cols-2"
              >
                {product.variants.map((v) => (
                  <RadioCard key={v.id} id={`variant-${v.id}`} value={v.id}>
                    <span className="font-medium">{v.name}</span>
                    {v.priceMinor !== null ? (
                      <span className="text-sm text-muted-foreground tabular-nums">{formatMoney(v.priceMinor, product.currency)}</span>
                    ) : null}
                  </RadioCard>
                ))}
              </RadioGroup>
            )}
          />
          {errors.variantId ? (
            <p id="variant-error" role="alert" className="text-xs font-medium text-danger">
              {errors.variantId.message}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <Field id="quantity" label="Quantity" error={errors.quantity?.message}>
        <div className="flex w-fit items-center rounded-md border border-input bg-surface">
          <Button variant="ghost" size="icon" onClick={() => stepQuantity(-1)} aria-label="Decrease quantity">
            <Minus aria-hidden="true" />
          </Button>
          <Input
            id="quantity"
            type="number"
            inputMode="numeric"
            min={product.minQty}
            max={maxQty}
            className="h-10 w-16 border-0 text-center"
            aria-invalid={Boolean(errors.quantity)}
            aria-describedby={describedBy('quantity', errors.quantity?.message)}
            {...register('quantity')}
          />
          <Button variant="ghost" size="icon" onClick={() => stepQuantity(1)} aria-label="Increase quantity">
            <Plus aria-hidden="true" />
          </Button>
        </div>
      </Field>

      <fieldset className="grid gap-4 rounded-lg border border-border bg-surface-muted/60 p-4">
        <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
          <Gift className="size-4 text-primary" aria-hidden="true" /> Gift options
        </legend>
        {giftProfile.giftWrapAvailable ? (
          <Controller
            control={control}
            name="giftWrap"
            render={({ field }) => (
              <div className="flex items-start gap-3">
                <Checkbox
                  id="gift-wrap"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
                <label htmlFor="gift-wrap" className="grid gap-0.5 text-sm">
                  <span className="font-medium">Add gift wrap</span>
                  <span className="text-muted-foreground">Hand-wrapped with ribbon. Prices are hidden on the invoice.</span>
                </label>
              </div>
            )}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Gift wrap isn’t available for this item.</p>
        )}
        {messageMax > 0 ? (
          <Field
            id="gift-message"
            label="Gift message (optional)"
            error={errors.giftMessage?.message}
            hint={`${message.length}/${messageMax} characters`}
          >
            <Textarea
              id="gift-message"
              rows={3}
              maxLength={messageMax}
              placeholder="Happy birthday! With love…"
              aria-invalid={Boolean(errors.giftMessage)}
              aria-describedby={describedBy('gift-message', errors.giftMessage?.message, true)}
              {...register('giftMessage')}
            />
          </Field>
        ) : null}
      </fieldset>

      <div className="grid gap-3 sm:flex">
        <Button type="submit" size="lg" className="sm:flex-1" disabled={!purchasable || adding}>
          {adding ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ShoppingBag aria-hidden="true" />}
          {product.isQuoteOnly ? 'Available on request' : adding ? 'Adding…' : 'Add to cart'}
        </Button>
        {added ? (
          <Button asChild size="lg" variant="outline">
            <Link href="/cart">View cart</Link>
          </Button>
        ) : null}
      </div>
      {addError ? (
        <Alert tone="error" title="Couldn’t add this to your cart">
          {addError}
        </Alert>
      ) : null}
      <p aria-live="polite" className="min-h-5 text-sm text-success">
        {added ? (
          <span className="inline-flex items-center gap-1">
            <Check className="size-4" aria-hidden="true" /> Added to your cart
          </span>
        ) : null}
      </p>
    </form>
  )
}
