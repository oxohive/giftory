import React from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { CatalogStackParamList } from '../../../navigation/types'
import { useTheme } from '../../../theme'
import { LoadingState } from '../../../components/ui/LoadingState'
import { ErrorState } from '../../../components/ui/ErrorState'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Button } from '../../../components/ui/Button'
import { useOccasions } from '../hooks/useOccasions'
import { OccasionTile } from '../components/OccasionTile'
import type { Occasion } from '../../../lib/api/occasions'

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
    return <LoadingState label="Loading occasions..." />
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
    justifyContent: 'space-between',
  },
})
