import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { IconButton } from '../../../components/ui/IconButton'
import { Input } from '../../../components/ui/Input'
import { PriceText } from '../../../components/ui/PriceText'
import { ProductImage } from '../../../components/ui/ProductImage'
import { useTheme } from '../../../theme'
import { confirmDestructive } from '../../../lib/confirm'
import type { CartLine } from '../../../lib/api/cart'
import { DEFAULT_GIFT_MESSAGE_MAX_LENGTH } from '../lib/cartErrorMessage'

const GIFT_MESSAGE_COMMIT_DELAY_MS = 500

export interface CartLineRowProps {
  line: CartLine
  currencyCode: string
  /** Disables every control while any cart mutation is in flight, to avoid overlapping edits. */
  busy?: boolean
  onQuantityChange: (quantity: number) => void
  onGiftChange: (patch: { giftWrap?: boolean; giftMessage?: string }) => void
  onRemove: () => void
}

/**
 * One cart line: quantity stepper, gift wrap toggle, gift message field
 * (independently editable per line, per TASK-06's acceptance criteria), and
 * a remove action.
 */
export function CartLineRow(props: CartLineRowProps): JSX.Element {
  const { line, currencyCode, busy = false, onQuantityChange, onGiftChange, onRemove } = props
  const theme = useTheme()

  const [giftMessage, setGiftMessage] = useState(line.giftMessage ?? '')
  const [messageError, setMessageError] = useState<string | null>(null)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the local draft in sync when the authoritative line changes from elsewhere
  // (server response, rollback), but not while the shopper is actively typing.
  useEffect(() => {
    if (commitTimer.current) return
    setGiftMessage(line.giftMessage ?? '')
  }, [line.giftMessage])

  useEffect(
    () => () => {
      if (commitTimer.current) clearTimeout(commitTimer.current)
    },
    [],
  )

  function handleMessageChange(text: string) {
    setGiftMessage(text)
    if (commitTimer.current) clearTimeout(commitTimer.current)

    if (text.trim().length > DEFAULT_GIFT_MESSAGE_MAX_LENGTH) {
      setMessageError(`Gift message is too long (maximum ${DEFAULT_GIFT_MESSAGE_MAX_LENGTH} characters).`)
      return // validation error shown inline; nothing sent to the server
    }
    setMessageError(null)
    commitTimer.current = setTimeout(() => {
      commitTimer.current = null
      onGiftChange({ giftMessage: text })
    }, GIFT_MESSAGE_COMMIT_DELAY_MS)
  }

  const decrementDisabled = busy || line.quantity <= 1
  const incrementDisabled = busy

  function handleRemovePress(): void {
    confirmDestructive({
      title: 'Remove item?',
      message: `Remove "${line.title}" from your cart?`,
      confirmLabel: 'Remove',
      onConfirm: onRemove,
    })
  }

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <ProductImage uri={line.imageUrl} style={styles.thumbnail} accessibilityLabel={line.title} />
        <Text style={[theme.typography.subheading, { color: theme.colors.text, flex: 1 }]} numberOfLines={1}>
          {line.title}
          {line.variantName ? ` · ${line.variantName}` : ''}
        </Text>
        <PriceText amountMajor={line.lineTotalMajor} currencyCode={currencyCode} />
      </View>

      <View style={styles.row}>
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
          Unit price: <PriceText amountMajor={line.unitPriceMajor} currencyCode={currencyCode} />
        </Text>
      </View>

      <View style={[styles.row, styles.stepper]}>
        <IconButton
          icon="remove-circle-outline"
          variant="surface"
          disabled={decrementDisabled}
          accessibilityLabel="Decrease quantity"
          onPress={() => onQuantityChange(line.quantity - 1)}
        />
        <Text
          style={[theme.typography.body, { color: theme.colors.text, marginHorizontal: theme.spacing(2) }]}
          accessibilityLabel={`Quantity: ${line.quantity}`}
        >
          {line.quantity}
        </Text>
        <IconButton
          icon="add-circle-outline"
          variant="surface"
          disabled={incrementDisabled}
          accessibilityLabel="Increase quantity"
          onPress={() => onQuantityChange(line.quantity + 1)}
        />
      </View>

      <View style={styles.row}>
        <Button
          title={line.giftWrap ? 'Gift wrap: On' : 'Gift wrap: Off'}
          variant={line.giftWrap ? 'primary' : 'secondary'}
          disabled={busy}
          accessibilityLabel="Toggle gift wrap"
          onPress={() => onGiftChange({ giftWrap: !line.giftWrap })}
        />
      </View>

      <View style={styles.row}>
        <Input
          label="Gift message"
          value={giftMessage}
          onChangeText={handleMessageChange}
          error={messageError ?? undefined}
          placeholder="Add a gift message (optional)"
          accessibilityLabel="Gift message"
          maxLength={DEFAULT_GIFT_MESSAGE_MAX_LENGTH}
          showCharacterCount
        />
      </View>

      <View style={[styles.row, styles.footer]}>
        <Button
          title="Remove"
          variant="destructive"
          disabled={busy}
          onPress={handleRemovePress}
          accessibilityLabel="Remove item"
        />
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  thumbnail: {
    width: 48,
    height: 48,
  },
  row: {
    marginTop: 12,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footer: {
    alignItems: 'flex-end',
  },
})
