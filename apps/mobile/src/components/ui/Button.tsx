import React from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native'
import { useTheme } from '../../theme'

export interface ButtonProps {
  title: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  loading?: boolean
  disabled?: boolean
  accessibilityLabel?: string
}

export function Button(props: ButtonProps): JSX.Element {
  const { title, onPress, variant = 'primary', loading = false, disabled = false, accessibilityLabel } = props
  const theme = useTheme()
  const isDisabled = disabled || loading

  const containerStyle = [
    styles.base,
    {
      borderRadius: theme.radii.md,
      paddingVertical: theme.spacing(1.5),
      paddingHorizontal: theme.spacing(2),
    },
    variant === 'primary' && { backgroundColor: theme.colors.primary },
    variant === 'secondary' && {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    variant === 'ghost' && { backgroundColor: 'transparent' },
    isDisabled && styles.disabled,
  ]

  const textColor =
    variant === 'primary' ? theme.colors.primaryText : theme.colors.text

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      activeOpacity={0.8}
      style={containerStyle}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text style={[theme.typography.body, styles.text, { color: textColor }]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  text: {
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
})
