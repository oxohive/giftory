import React from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { CatalogStackParamList } from '../../../navigation/types'
import { useTheme } from '../../../theme'
import { ErrorState } from '../../../components/ui/ErrorState'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Skeleton } from '../../../components/ui/Skeleton'
import { useOccasions } from '../hooks/useOccasions'
import { OccasionTile } from '../components/OccasionTile'
import type { Occasion } from '../../../lib/api/occasions'

/** Placeholder shaped like `OccasionTile` — image block + title + description lines. */
function OccasionTileSkeleton(): JSX.Element {
  const theme = useTheme()
  return (
    <View style={styles.tileWrapper}>
      <Card style={styles.tileCard}>
        <Skeleton width="100%" height={96} borderRadius={theme.radii.md} />
        <Skeleton width="70%" height={18} style={{ marginTop: theme.spacing(1) }} />
        <Skeleton width="90%" height={12} style={{ marginTop: theme.spacing(0.5) }} />
      </Card>
    </View>
  )
}

type Props = NativeStackScreenProps<CatalogStackParamList, 'Home'>

/**
 * Relies on the app-wide `QueryClientProvider` mounted once in `App.tsx`
 * (TASK-09) — no local provider wrapper needed here.
 */
export default function HomeScreen({ navigation }: Props): JSX.Element {
  const theme = useTheme()
  const { data: occasions, isLoading, isError, error, refetch } = useOccasions()

  const goToOccasion = (occasion: Occasion) => {
    navigation.navigate('ProductList', { occasion: occasion.code })
  }

  const goToAllProducts = () => {
    navigation.navigate('ProductList', undefined)
  }

  if (isLoading) {
    return (
      <View style={{ padding: theme.spacing(2) }} accessibilityLabel="Loading occasions">
        <View style={{ marginBottom: theme.spacing(2) }}>
          <Text style={[theme.typography.heading, { color: theme.colors.text }]}>Giftory</Text>
          <Text style={[theme.typography.body, { color: theme.colors.textMuted, marginTop: theme.spacing(0.5) }]}>
            Shop by occasion
          </Text>
        </View>
        <View style={styles.row}>
          <OccasionTileSkeleton />
          <OccasionTileSkeleton />
        </View>
        <View style={styles.row}>
          <OccasionTileSkeleton />
          <OccasionTileSkeleton />
        </View>
      </View>
    )
  }

  if (isError) {
    return (
      <ErrorState
        message={error?.message ?? 'Failed to load occasions'}
        onRetry={() => refetch()}
      />
    )
  }

  if (!occasions || occasions.length === 0) {
    return (
      <EmptyState
        title="No occasions available right now"
        description="Check back soon, or browse the full catalog instead."
        action={<Button title="Browse all gifts" onPress={goToAllProducts} />}
      />
    )
  }

  return (
    <FlatList
      data={occasions}
      keyExtractor={(item) => item.code}
      numColumns={2}
      contentContainerStyle={{ padding: theme.spacing(2) }}
      columnWrapperStyle={styles.row}
      ListHeaderComponent={
        <View style={{ marginBottom: theme.spacing(2) }}>
          <Text style={[theme.typography.heading, { color: theme.colors.text }]}>Giftory</Text>
          <Text style={[theme.typography.body, { color: theme.colors.textMuted, marginTop: theme.spacing(0.5) }]}>
            Shop by occasion
          </Text>
        </View>
      }
      ListFooterComponent={
        <View style={{ marginTop: theme.spacing(1) }}>
          <Button title="Browse all gifts" variant="secondary" onPress={goToAllProducts} />
        </View>
      }
      renderItem={({ item }) => <OccasionTile occasion={item} onPress={() => goToOccasion(item)} />}
    />
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tileWrapper: {
    width: '48%',
    marginBottom: 16,
  },
  tileCard: {
    alignItems: 'flex-start',
  },
})
