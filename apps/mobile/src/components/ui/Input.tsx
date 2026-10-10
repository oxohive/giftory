import React from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
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
}

export function Input(props: InputProps): JSX.Element {
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
  } = props
  const theme = useTheme()
  const hasError = Boolean(error)
  const combinedAccessibilityLabel = `${accessibilityLabel ?? label}${hasError ? `, error: ${error}` : ''}`

  return (
    <View style={styles.container}>
      <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: theme.spacing(0.5) }]}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        maxLength={maxLength}
        accessible
        accessibilityLabel={combinedAccessibilityLabel}
        accessibilityState={{ disabled: false }}
        style={[
          theme.typography.body,
          styles.input,
          {
            color: theme.colors.text,
            borderColor: hasError ? theme.colors.danger : theme.colors.border,
            borderRadius: theme.radii.sm,
            backgroundColor: theme.colors.surface,
            paddingHorizontal: theme.spacing(1.5),
            paddingVertical: theme.spacing(1),
          },
        ]}
      />
      {hasError ? (
        <Text
          style={[
            theme.typography.caption,
            { color: theme.colors.danger, marginTop: theme.spacing(0.5) },
          ]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  input: {
    borderWidth: 1,
  },
})
