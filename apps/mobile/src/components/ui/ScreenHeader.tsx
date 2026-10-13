import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import type { ComponentProps } from 'react'
import { useTheme } from '../../theme'
import { IconButton } from './IconButton'

type IoniconName = ComponentProps<typeof Ionicons>['name']

export interface ScreenHeaderProps {
  title: string
  /** Optional glyph shown before the title — e.g. the "gift" wordmark icon on Home. */
  titleIcon?: IoniconName
  onBack?: () => void
  rightAction?: React.ReactNode
}

/**
 * The one header component every screen in the app renders. Home and
 * Account each built their own one-off masthead; every other screen relied
 * on React Navigation's native-stack header instead. Even themed to match
 * colors and font (an earlier pass), a native header is still a different
 * platform component underneath — different alignment, padding, and height,
 * with no room for icon actions — so it could never actually look the same
 * as Home/Account, only color-adjacent. This component is the real fix:
 * every stack now sets `headerShown: false` globally and renders this
 * instead, so "Products"/"Cart"/"Order"/etc. share Home's exact structure,
 * not just its palette. Home itself now also renders this (via `titleIcon`
 * for its wordmark glyph) instead of a separate hand-rolled masthead.
 *
 * Render this as a fixed sibling ABOVE a screen's ScrollView/FlatList, never
 * inside its contentContainerStyle — putting safe-area padding inside
 * scrollable content lets it scroll away from under the status bar
 * (confirmed on HomeScreen; this component exists partly to stop that
 * mistake from being repeated screen by screen).
 */
export function ScreenHeader(props: ScreenHeaderProps): JSX.Element {
  const { title, titleIcon, onBack, rightAction } = props
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background, paddingTop: insets.top + theme.spacing(1.5) },
      ]}
    >
      <View style={styles.left}>
        {onBack ? <IconButton icon="chevron-back" size="sm" accessibilityLabel="Go back" onPress={onBack} /> : null}
        {titleIcon ? <Ionicons name={titleIcon} size={theme.sizes.icon.md} color={theme.colors.primary} /> : null}
        <Text
          style={[theme.typography.heading, { color: theme.colors.text, flexShrink: 1 }]}
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>
      {rightAction ? <View style={styles.right}>{rightAction}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
})
