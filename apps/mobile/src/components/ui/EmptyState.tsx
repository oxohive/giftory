import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../../theme'

export function EmptyState(props: {
  title: string
  description?: string
  action?: React.ReactNode
}): JSX.Element {
  const { title, description, action } = props
  const theme = useTheme()

  return (
    <View style={styles.container} accessible accessibilityRole="text">
      <Text
        style={[
          theme.typography.subheading,
          { color: theme.colors.text, textAlign: 'center' },
        ]}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={[
            theme.typography.body,
            {
              color: theme.colors.textMuted,
              textAlign: 'center',
              marginTop: theme.spacing(1),
            },
          ]}
        >
          {description}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: theme.spacing(2) }}>{action}</View> : null}
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
