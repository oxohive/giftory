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
  /**
   * `'ghost'` is this app's tertiary variant (transparent background, text
   * only) — there's no separately-named `'tertiary'`, `'ghost'` fills that
   * role. `'destructive'` is for actions that delete/remove something
   * (remove item, clear cart, delete address). For an icon-only control,
   * use `IconButton` instead of `Button` — this component always renders a
   * text label.
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'
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
      minHeight: theme.touchTarget.min,
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
    variant === 'destructive' && { backgroundColor: theme.colors.destructive, ...theme.elevation.sm },
    // Disabled (not merely loading) gets its own token-driven look — loading
    // keeps the variant's normal color with a spinner on top, since it's a
    // transient "working" state, not an inert one.
    disabled && !loading && { backgroundColor: theme.colors.disabledBackground, borderWidth: 0 },
  ]

  const textColor = disabled && !loading
    ? theme.colors.disabledText
    : variant === 'primary'
    ? theme.colors.primaryText
    : variant === 'destructive'
    ? theme.colors.destructiveText
    : theme.colors.text

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
        <Text style={[theme.typography.button, { color: textColor }]}>{title}</Text>
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
})
