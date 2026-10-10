import React from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { useTheme } from '../../../theme'

export interface FilterChipProps {
  label: string
  selected: boolean
  onPress: () => void
}

/** Small toggle chip used for category/occasion/recipient/sort selection in Product List filters. */
export function FilterChip(props: FilterChipProps): JSX.Element {
  const { label, selected, onPress } = props
  const theme = useTheme()

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[
        styles.base,
        {
          borderRadius: theme.radii.md,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
          paddingHorizontal: theme.spacing(1.5),
          paddingVertical: theme.spacing(0.75),
        },
      ]}
    >
      <Text
        style={[
          theme.typography.caption,
          { color: selected ? theme.colors.primaryText : theme.colors.text, fontWeight: '600' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
})
