'use client'

import { AlertTriangle, Gift, Loader2, Minus, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react'
import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { Price } from '@/components/catalog/price'
import { ProductImage } from '@/components/catalog/product-image'
import { StateMessage } from '@/components/state-message'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cartErrorMessage, describeLineIssue, type CartLine } from '@/lib/api/cart'
import { useCart } from '@/lib/cart/cart-context'

/** Generous client-side cap; the backend enforces the product's real limit (gift_message_too_long). */
const GIFT_MESSAGE_UI_LIMIT = 500

function GiftOptionsEditor({ line, onDone }: { line: CartLine; onDone: () => void }) {
  const { updateGift, dismissLineError } = useCart()
  const [giftWrap, setGiftWrap] = useState(line.gift.giftWrap)
  const [giftMessage, setGiftMessage] = useState(line.gift.giftMessage)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idBase = `gift-${line.id}`

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateGift(line.id, { giftWrap, giftMessage })
      onDone()
    } catch (err) {
      // Shown next to the fields rather than on the line.
      dismissLineError(line.id)
      setError(cartErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="grid gap-3 rounded-md border border-border p-3" aria-label={`Gift options for ${line.title}`}>
      <div className="flex items-center gap-3">
        <Checkbox id={`${idBase}-wrap`} checked={giftWrap} onCheckedChange={(checked) => setGiftWrap(checked === true)} />
        <label htmlFor={`${idBase}-wrap`} className="text-sm">
          Gift wrap
        </label>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${idBase}-message`} className="text-sm font-medium">
          Gift message (optional)
        </label>
        <Textarea
          id={`${idBase}-message`}
          rows={3}
          maxLength={GIFT_MESSAGE_UI_LIMIT}
          value={giftMessage}
          onChange={(e) => setGiftMessage(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${idBase}-error` : `${idBase}-hint`}
        />
        {error ? (
          <p id={`${idBase}-error`} role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        ) : (
          <p id={`${idBase}-hint`} className="text-xs text-muted-foreground">
            {giftMessage.length} characters
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Save gift options
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function CartLineRow({ line }: { line: CartLine }) {
  const { setQuantity, removeLine, lineErrors, dismissLineError } = useCart()
  const [editingGift, setEditingGift] = useState(false)
  const error = lineErrors[line.id] ?? null
  const saved = !line.id.startsWith('optimistic-')
  const lineTotal = line.totalMinor ?? (line.unitPriceMinor !== null ? line.unitPriceMinor * line.quantity : null)

  return (
    <li className="flex gap-4 py-5" aria-busy={line.pending || undefined}>
      <Link href={`/products/${encodeURIComponent(line.slug)}`} className="w-20 shrink-0 overflow-hidden rounded-md border border-border sm:w-24">
        <ProductImage src={line.imageUrl} alt={line.title} />
      </Link>
      <div className="grid flex-1 gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-sans font-medium">
              <Link href={`/products/${encodeURIComponent(line.slug)}`} className="hover:underline">
                {line.title}
              </Link>
            </h3>
            {line.variantName ? <p className="text-sm text-muted-foreground">{line.variantName}</p> : null}
            {line.unitPriceMinor !== null && line.quantity > 1 ? (
              <p className="text-xs text-muted-foreground">
                <Price minor={line.unitPriceMinor} currency={line.currency} /> each
              </p>
            ) : null}
          </div>
          <p className={line.pending ? 'font-semibold text-muted-foreground' : 'font-semibold'}>
            {lineTotal !== null ? <Price minor={lineTotal} currency={line.currency} /> : <span className="text-sm">Price unavailable</span>}
          </p>
        </div>

        {line.issue ? (
          <p className="flex items-start gap-1.5 text-sm font-medium text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {describeLineIssue(line.issue)}
          </p>
        ) : null}

        {editingGift ? (
          <GiftOptionsEditor line={line} onDone={() => setEditingGift(false)} />
        ) : line.gift.giftWrap || line.gift.giftMessage ? (
          <div className="grid gap-1 rounded-md bg-surface-muted p-2 text-sm">
            {line.gift.giftWrap ? (
              <p className="flex items-center gap-1.5">
                <Gift className="size-4 text-primary" aria-hidden="true" /> Gift wrapped
              </p>
            ) : null}
            {line.gift.giftMessage ? <p className="italic text-muted-foreground">“{line.gift.giftMessage}”</p> : null}
          </div>
        ) : null}

        {line.isCustomizable ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3.5" aria-hidden="true" /> Personalisation will be available with our 3D designer soon.
          </p>
        ) : null}

        {error ? (
          <div role="alert" className="flex items-start justify-between gap-2 rounded-md border border-danger/40 bg-danger/10 p-2 text-sm">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => dismissLineError(line.id)}
              className="shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
              aria-label="Dismiss message"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center rounded-md border border-input" role="group" aria-label={`Quantity for ${line.title}`}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => (line.quantity <= 1 ? removeLine(line.id) : setQuantity(line.id, line.quantity - 1))}
              disabled={!saved}
              aria-label={line.quantity <= 1 ? `Remove ${line.title}` : `Decrease quantity of ${line.title}`}
            >
              <Minus aria-hidden="true" />
            </Button>
            <span className="w-8 text-center tabular-nums" aria-live="polite">
              {line.quantity}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setQuantity(line.id, line.quantity + 1)}
              disabled={!saved || line.quantity >= line.maxQuantity || !line.available}
              aria-label={`Increase quantity of ${line.title}`}
            >
              <Plus aria-hidden="true" />
            </Button>
          </div>
          <div className="flex gap-1">
            {!editingGift && line.available ? (
              <Button variant="ghost" size="sm" onClick={() => setEditingGift(true)} disabled={!saved} className="text-muted-foreground">
                <Pencil aria-hidden="true" /> Gift options
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => removeLine(line.id)} disabled={!saved} className="text-muted-foreground">
              <Trash2 aria-hidden="true" /> Remove
            </Button>
          </div>
        </div>
      </div>
    </li>
  )
}

export function CartView() {
  const { lines, ready, isError, error, refetch, subtotalMinor, itemCount, hasIssues, isSyncing, notice, dismissNotice, cartError, clear } =
    useCart()

  if (!ready) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          Loading cart…
        </span>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    )
  }

  if (isError) {
    return (
      <StateMessage
        kind="error"
        title="We couldn’t load your cart"
        action={
          <Button variant="outline" onClick={refetch}>
            Try again
          </Button>
        }
      >
        {error instanceof Error ? error.message : 'Please try again.'}
      </StateMessage>
    )
  }

  const noticeAlert = notice ? (
    <div className="mb-6 grid gap-2">
      <Alert tone="warning" title="Your cart was updated">
        {notice}
      </Alert>
      <Button variant="link" size="sm" className="justify-self-start" onClick={dismissNotice}>
        Dismiss
      </Button>
    </div>
  ) : null

  if (lines.length === 0) {
    return (
      <>
        {noticeAlert}
        <StateMessage
          title="Your cart is empty"
          action={
            <Button asChild>
              <Link href="/products">Find a gift</Link>
            </Button>
          }
        >
          Looking for inspiration? Browse gifts by occasion.
        </StateMessage>
      </>
    )
  }

  return (
    <>
      {noticeAlert}
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <section aria-label="Cart items" className="grid content-start gap-3">
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface px-4 sm:px-5">
            {lines.map((line) => (
              <CartLineRow key={line.id} line={line} />
            ))}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            className="justify-self-end text-muted-foreground"
            onClick={() => {
              if (window.confirm('Remove all items from your cart?')) void clear().catch(() => undefined)
            }}
          >
            Empty cart
          </Button>
          {cartError ? <Alert tone="error" title="Your cart couldn’t be updated">{cartError}</Alert> : null}
        </section>
        <Card className="h-fit lg:sticky lg:top-24">
          <CardHeader>
            <CardTitle>Order summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <dl className="grid gap-2 text-sm" aria-busy={isSyncing || undefined}>
              <div className="flex justify-between">
                <dt>
                  Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})
                </dt>
                <dd className="font-medium">
                  <Price minor={subtotalMinor} />
                </dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>Shipping</dt>
                <dd>Calculated at checkout</dd>
              </div>
            </dl>
            <p className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
              {isSyncing ? 'Updating your cart…' : 'Prices include GST. Final amounts are confirmed at checkout.'}
            </p>
            {hasIssues ? (
              <Alert tone="warning" title="Some items need your attention">
                Remove or change the highlighted items before checking out.
              </Alert>
            ) : null}
            {hasIssues ? (
              <Button size="lg" className="w-full" disabled>
                Proceed to checkout
              </Button>
            ) : (
              <Button asChild size="lg" className="w-full">
                <Link href="/checkout">Proceed to checkout</Link>
              </Button>
            )}
            <Button asChild variant="link" className="w-full">
              <Link href="/products">Continue shopping</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
