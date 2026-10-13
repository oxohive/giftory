import React, { useEffect, useRef } from 'react'
import { Animated, StyleProp, ViewStyle } from 'react-native'
import { useTheme } from '../../theme'

export interface SkeletonProps {
  width?: number | `${number}%`
  height: number
  style?: StyleProp<ViewStyle>
  borderRadius?: number
}

/**
 * Base shimmering placeholder block. A plain opacity-pulse (no new
 * dependency) cycling between ~0.4 and ~1.0 — good enough for this pass;
 * a dedicated library could add a shimmer-sweep effect later if needed.
 */
export function Skeleton(props: SkeletonProps): JSX.Element {
  const { width, height, style, borderRadius } = props
  const theme = useTheme()
  const opacity = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [opacity])

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: borderRadius ?? theme.radii.md,
          backgroundColor: theme.colors.border,
          opacity,
        },
        style,
      ]}
    />
  )
}
