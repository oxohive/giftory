import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../../theme'

export function Badge(props: { label: string; tone?: 'info' | 'success' | 'warning' }): JSX.Element {
  const { label, tone = 'info' } = props
  const theme = useTheme()

  const toneColor =
    tone === 'success'
      ? theme.colors.success
      : tone === 'warning'
      ? theme.colors.warning
      : theme.colors.primary

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: theme.colors.surface,
          borderColor: toneColor,
          borderRadius: theme.radii.sm,
          paddingHorizontal: theme.spacing(1),
          paddingVertical: theme.spacing(0.5),
        },
      ]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Text style={[theme.typography.caption, { color: toneColor, fontWeight: '600' }]}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
})
