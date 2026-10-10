import React from 'react'
import { StyleProp, Text, TextStyle } from 'react-native'
import { useTheme } from '../../theme'

export interface PriceTextProps {
  amountMajor: number
  currencyCode?: string
  style?: StyleProp<TextStyle>
}

const formatters = new Map<string, Intl.NumberFormat>()

function formatterFor(currency: string): Intl.NumberFormat {
  const key = currency.toUpperCase()
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: key })
    formatters.set(key, formatter)
  }
  return formatter
}

/**
 * Formats a DECIMAL major-unit amount (e.g. 499.00) as "₹499.00", matching
 * the convention in apps/storefront/src/lib/money.ts formatMoney() —
 * which formats `minorUnits / 100` through the same `Intl.NumberFormat`
 * ('en-IN', { style: 'currency', currency }) call. Do NOT pass minor units
 * (paise) here; this component expects the already-major-unit wire value.
 */
export function PriceText(props: PriceTextProps): JSX.Element {
  const { amountMajor, currencyCode = 'INR', style } = props
  const theme = useTheme()
  const formatted = formatterFor(currencyCode).format(amountMajor)

  return (
    <Text style={[theme.typography.body, { color: theme.colors.text }, style]}>
      {formatted}
    </Text>
  )
}
