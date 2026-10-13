import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../../theme'

export function Badge(props: { label: string; tone?: 'info' | 'success' | 'warning' | 'danger' }): JSX.Element {
  const { label, tone = 'info' } = props
  const theme = useTheme()

  const toneColor =
    tone === 'success'
      ? theme.colors.success
      : tone === 'warning'
      ? theme.colors.warning
      : tone === 'danger'
      ? theme.colors.danger
      : theme.colors.primary

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.pill,
          paddingHorizontal: theme.spacing(1.25),
          paddingVertical: theme.spacing(0.5),
        },
      ]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <View style={[styles.dot, { backgroundColor: toneColor }]} />
      <Text
        numberOfLines={1}
        style={[
          theme.typography.caption,
          { color: theme.colors.text, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', flexShrink: 1 },
        ]}
      >
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // `alignSelf: 'flex-start'` alone only sizes the pill to its own text —
    // it does NOT stop that text from exceeding the parent's width when the
    // badge sits alone (e.g. stacked under a price, not in a row with a
    // sibling to shrink against). Confirmed on-device: "Customizable" on a
    // narrow 2-col product card rendered past the card's edge entirely.
    maxWidth: '100%',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
})
