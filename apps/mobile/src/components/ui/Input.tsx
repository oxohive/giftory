import React, { forwardRef, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import type { TextInputProps } from 'react-native'
import { useTheme } from '../../theme'

export interface InputProps {
  label: string
  value: string
  onChangeText: (value: string) => void
  error?: string
  placeholder?: string
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address'
  secureTextEntry?: boolean
  maxLength?: number
  accessibilityLabel?: string
  /** Shows a required-field marker (*) next to the label. */
  required?: boolean
  disabled?: boolean
  /** Shows a live `n/maxLength` counter under the field — set together with `maxLength` (e.g. a gift message). */
  showCharacterCount?: boolean
  /** Keyboard action button — 'next' to advance focus to the next field, 'done' to dismiss/submit on the last field. */
  returnKeyType?: TextInputProps['returnKeyType']
  onSubmitEditing?: TextInputProps['onSubmitEditing']
  blurOnSubmit?: boolean
}

/**
 * Forwards its ref to the underlying `TextInput` so a form can chain
 * `nextRef.current?.focus()` from one field's `onSubmitEditing` to the
 * next — checklist section 6: "Define Next/Done keyboard actions and focus
 * movement."
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(props, ref) {
  const {
    label,
    value,
    onChangeText,
    error,
    placeholder,
    keyboardType = 'default',
    secureTextEntry = false,
    maxLength,
    accessibilityLabel,
    required = false,
    disabled = false,
    showCharacterCount = false,
    returnKeyType,
    onSubmitEditing,
    blurOnSubmit,
  } = props
  const theme = useTheme()
  const [focused, setFocused] = useState(false)
  const hasError = Boolean(error)
  const combinedAccessibilityLabel = `${accessibilityLabel ?? label}${required ? ', required' : ''}${
    hasError ? `, error: ${error}` : ''
  }`

  const borderColor = hasError
    ? theme.colors.danger
    : focused
    ? theme.colors.focusRing
    : theme.colors.border

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
          {label}
          {required ? <Text style={{ color: theme.colors.danger }}> *</Text> : null}
        </Text>
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        maxLength={maxLength}
        editable={!disabled}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        blurOnSubmit={blurOnSubmit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessible
        accessibilityLabel={combinedAccessibilityLabel}
        accessibilityState={{ disabled }}
        style={[
          theme.typography.body,
          styles.input,
          {
            color: disabled ? theme.colors.disabledText : theme.colors.text,
            borderColor,
            borderWidth: focused && !hasError ? 2 : 1,
            borderRadius: theme.radii.lg,
            backgroundColor: disabled ? theme.colors.disabledBackground : theme.colors.background,
            paddingHorizontal: theme.spacing(2),
            paddingVertical: theme.spacing(1.25),
          },
        ]}
      />
      <View style={styles.footerRow}>
        {hasError ? (
          <Text style={[theme.typography.caption, { color: theme.colors.danger, marginTop: theme.spacing(0.5) }]}>
            {error}
          </Text>
        ) : (
          <View />
        )}
        {showCharacterCount && maxLength ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing(0.5) }]}>
            {value.length}/{maxLength}
          </Text>
        ) : null}
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  input: {},
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})
