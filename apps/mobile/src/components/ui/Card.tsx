import React from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { useTheme } from '../../theme'

export interface CardProps {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
}

export function Card(props: CardProps): JSX.Element {
  const { children, style } = props
  const theme = useTheme()

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.lg,
          padding: theme.spacing(2),
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
  },
})
