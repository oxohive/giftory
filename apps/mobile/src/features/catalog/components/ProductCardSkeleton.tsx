import React from 'react'
import { StyleSheet, View } from 'react-native'
import { useTheme } from '../../../theme'
import { Card } from '../../../components/ui/Card'
import { Skeleton } from '../../../components/ui/Skeleton'

/**
 * Placeholder shaped like `ProductCard` (same wrapper/image/text proportions)
 * so the skeleton-to-real-content transition on first load doesn't jump.
 */
export function ProductCardSkeleton(): JSX.Element {
  const theme = useTheme()

  return (
    <View style={styles.wrapper}>
      <Card>
        <Skeleton width="100%" height={120} borderRadius={theme.radii.md} />
        <Skeleton width="90%" height={18} style={{ marginTop: theme.spacing(1) }} />
        <Skeleton width="60%" height={14} style={{ marginTop: theme.spacing(0.5) }} />
        <View style={styles.footerRow}>
          <Skeleton width={64} height={16} />
          <Skeleton width={70} height={20} borderRadius={theme.radii.sm} />
        </View>
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    width: '48%',
    marginBottom: 16,
  },
  footerRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})
