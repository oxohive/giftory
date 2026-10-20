import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme } from '../../theme'
import { useOnlineStatus } from '../../lib/useOnlineStatus'

/**
 * App-wide "you're offline" banner — mounted once in `App.tsx`, above
 * `NavigationContainer`, so it's visible regardless of which screen/tab is
 * active instead of every screen needing its own offline check (checklist
 * section 7: "Define offline behavior", applied globally rather than
 * per-screen per this fix pass's "single configurable, not per-screen"
 * requirement).
 */
export function OfflineBanner(): JSX.Element | null {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const online = useOnlineStatus()

  if (online) return null

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.warning, paddingTop: insets.top + theme.spacing(0.75) },
      ]}
      accessibilityLiveRegion="polite"
    >
      <Ionicons name="cloud-offline-outline" size={theme.sizes.icon.sm} color={styles.text.color} />
      <Text style={[theme.typography.label, styles.text]}>You're offline — some content may be out of date</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 8,
  },
  text: {
    color: '#1A1A1A',
  },
})
