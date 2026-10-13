import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import type { ComponentProps } from 'react'
import { useTheme } from '../../theme'
import { haptics } from '../../lib/haptics'

type IoniconName = ComponentProps<typeof Ionicons>['name']

export interface IconButtonProps {
  icon: IoniconName
  onPress: () => void
  /** Required, not optional — an icon-only control with no label is a
   * VoiceOver/TalkBack dead end (checklist section 9). */
  accessibilityLabel: string
  variant?: 'surface' | 'primary' | 'ghost'
  size?: 'sm' | 'md'
  disabled?: boolean
  /** Small numeric badge overlay (e.g. cart item count). Omit or pass 0 to hide it. */
  badgeCount?: number
}

/**
 * The one icon-only pressable every screen should use — replaces the
 * hand-rolled 40×40 icon buttons that used to live separately in
 * `ScreenHeader` and `HomeScreen` (inconsistent sizing, no shared touch
 * target, no haptic). Every instance:
 * - is at least `theme.touchTarget.min` (44pt iOS / 48dp Android) in both
 *   dimensions, per checklist section 9/3's touch-target guidance,
 * - fires `haptics.light()` on press, same as the shared `Button`,
 * - requires an `accessibilityLabel` at the type level.
 */
export function IconButton(props: IconButtonProps): JSX.Element {
  const { icon, onPress, accessibilityLabel, variant = 'surface', size = 'md', disabled = false, badgeCount = 0 } =
    props
  const theme = useTheme()
  const glyphSize = size === 'sm' ? theme.sizes.icon.sm : theme.sizes.icon.md

  const backgroundColor =
    variant === 'primary' ? theme.colors.primary : variant === 'surface' ? theme.colors.surface : 'transparent'
  const iconColor = variant === 'primary' ? theme.colors.primaryText : theme.colors.text
  const borderColor = variant === 'surface' ? theme.colors.border : 'transparent'

  function handlePress(): void {
    haptics.light()
    onPress()
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        {
          width: theme.touchTarget.min,
          height: theme.touchTarget.min,
          borderRadius: theme.touchTarget.min / 2,
          backgroundColor,
          borderWidth: variant === 'surface' ? 1 : 0,
          borderColor,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={glyphSize} color={iconColor} />
      {badgeCount > 0 ? (
        <View
          style={[
            styles.badge,
            { backgroundColor: theme.colors.primary, borderColor: backgroundColor === 'transparent' ? theme.colors.background : backgroundColor },
          ]}
        >
          <Text style={[theme.typography.small, { color: theme.colors.primaryText, fontWeight: '700' }]}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
})
