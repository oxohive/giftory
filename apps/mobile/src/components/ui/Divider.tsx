import React from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { useTheme } from '../../theme'

export interface DividerProps {
  style?: StyleProp<ViewStyle>
  /** 'horizontal' (default) is a full-width 1px line; 'vertical' is a 1px-wide full-height line for inline separators. */
  orientation?: 'horizontal' | 'vertical'
}

/** The one hairline-separator component every screen should use instead of a one-off `borderBottomWidth` style. */
export function Divider(props: DividerProps): JSX.Element {
  const { style, orientation = 'horizontal' } = props
  const theme = useTheme()

  // RN's `StyleSheet.hairlineWidth` gives the thinnest renderable line on
  // the current device/density instead of an arbitrary `1`.
  const thickness = StyleSheet.hairlineWidth

  return (
    <View
      style={[
        orientation === 'horizontal' ? { height: thickness, width: '100%' } : { width: thickness, height: '100%' },
        { backgroundColor: theme.colors.border },
        style,
      ]}
    />
  )
}
