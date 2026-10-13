import React from 'react'
import { KeyboardAvoidingView, Platform, StyleProp, ViewStyle } from 'react-native'

export interface KeyboardAwareScreenProps {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
}

/**
 * The one keyboard-avoidance wrapper every screen with text inputs should
 * render its content in (checklist section 6/8: "Ensure the keyboard does
 * not cover the active field or primary action"). Before this, no screen
 * in the app wrapped its form content in `KeyboardAvoidingView` at all.
 *
 * `behavior="padding"` on iOS (the standard choice — `KeyboardAvoidingView`
 * resizes by adding bottom padding, which plays well with a ScrollView
 * child); Android is deliberately left with no `behavior` (`undefined`) —
 * RN's default `windowSoftInputMode="adjustResize"` on Android already
 * resizes the whole window when the keyboard opens, and stacking this
 * component's own padding-based adjustment on top of that double-compensates,
 * pushing content up further than the keyboard actually requires.
 */
export function KeyboardAwareScreen(props: KeyboardAwareScreenProps): JSX.Element {
  const { children, style } = props

  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : undefined}
    >
      {children}
    </KeyboardAvoidingView>
  )
}
