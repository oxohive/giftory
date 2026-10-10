import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../../theme'
import { Button } from './Button'

export function ErrorState(props: { message: string; onRetry?: () => void }): JSX.Element {
  const { message, onRetry } = props
  const theme = useTheme()

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={message}
    >
      <Text
        style={[
          theme.typography.body,
          { color: theme.colors.danger, textAlign: 'center' },
        ]}
      >
        {message}
      </Text>
      {onRetry ? (
        <View style={{ marginTop: theme.spacing(2) }}>
          <Button title="Retry" onPress={onRetry} variant="secondary" />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
})
