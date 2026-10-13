import React from 'react'
import { StyleProp, View, ViewStyle } from 'react-native'
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
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.xl,
          padding: theme.spacing(2),
          ...theme.elevation.sm,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}
