import React from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native'
import { useTheme } from '../../theme'
import { haptics } from '../../lib/haptics'

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
      borderRadius: theme.radii.pill,
      paddingVertical: theme.spacing(1.75),
      paddingHorizontal: theme.spacing(3),
    },
    variant === 'primary' && { backgroundColor: theme.colors.primary, ...theme.elevation.sm },
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

  function handlePress(): void {
    haptics.light()
    onPress()
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
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
        <Text style={[theme.typography.body, styles.text, { color: textColor, letterSpacing: 0.2 }]}>
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
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.5,
  },
})
