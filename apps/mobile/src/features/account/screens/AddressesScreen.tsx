/**
 * Address book — full CRUD UI against the real `account/addresses` endpoints
 * (TASK-04's `addresses.ts`), gated behind a "sign in to manage saved
 * addresses" message specifically when a call comes back `ApiError` with
 * `status === 401` (every call does today, since there's no login in v1 —
 * see AccountScreen.tsx's top-of-file scoping comment). Any *other* error is
 * shown as a generic, retryable failure instead of the sign-in gate, so a
 * real backend/network problem doesn't get silently mislabeled as "please
 * sign in". When real auth lands, the only change needed here is removing
 * the `gated` condition below — the list/create/edit/delete UI underneath it
 * is already the real thing.
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  createAddress,
  deleteAddress,
  listAddresses,
  updateAddress,
  type StoredAddress,
} from '../../../lib/api/addresses'
import type { Address } from '../../../lib/api/checkout'
import { ApiError } from '../../../lib/api/errors'
import { useTheme } from '../../../theme'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/EmptyState'
import { ErrorState } from '../../../components/ui/ErrorState'
import { LoadingState } from '../../../components/ui/LoadingState'
import { AddressForm } from '../components/AddressForm'

type FormMode = { kind: 'create' } | { kind: 'edit'; address: StoredAddress }

export default function AddressesScreen(): JSX.Element {
  const theme = useTheme()
  const [isLoading, setIsLoading] = useState(true)
  const [isGated, setIsGated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addresses, setAddresses] = useState<StoredAddress[]>([])
  const [formMode, setFormMode] = useState<FormMode | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setIsGated(false)
    try {
      const items = await listAddresses()
      setAddresses(items)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setIsGated(true)
      } else if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Something went wrong loading your addresses.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleCreate = async (value: Address) => {
    setIsSubmitting(true)
    try {
      await createAddress(value)
      setFormMode(null)
      await load()
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not save this address.'
      Alert.alert('Could not save address', message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdate = async (id: string, value: Address) => {
    setIsSubmitting(true)
    try {
      await updateAddress(id, value)
      setFormMode(null)
      await load()
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not update this address.'
      Alert.alert('Could not update address', message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = (address: StoredAddress) => {
    Alert.alert('Remove address', `Remove the address for ${address.fullName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAddress(address.id)
            await load()
          } catch (err) {
            const message = err instanceof ApiError ? err.message : 'Could not remove this address.'
            Alert.alert('Could not remove address', message)
          }
        },
      },
    ])
  }

  if (isLoading) {
    return <LoadingState label="Loading addresses" />
  }

  if (isGated) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background, padding: theme.spacing(2) }]}>
        <Card>
          <Badge label="Sign-in required" tone="warning" />
          <Text style={[theme.typography.subheading, { color: theme.colors.text, marginTop: theme.spacing(1) }]}>
            Sign in to manage saved addresses
          </Text>
          <Text style={[theme.typography.body, { color: theme.colors.textMuted, marginTop: theme.spacing(1) }]}>
            Saved addresses are tied to an account. Sign-in isn't available yet in this app — once it is, your
            address book will show up here automatically.
          </Text>
        </Card>
      </View>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={load} />
  }

  if (formMode) {
    const initialValue = formMode.kind === 'edit' ? formMode.address : undefined
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background, padding: theme.spacing(2) }]}>
        <Text style={[theme.typography.heading, { color: theme.colors.text, marginBottom: theme.spacing(2) }]}>
          {formMode.kind === 'create' ? 'Add address' : 'Edit address'}
        </Text>
        <AddressForm
          initialValue={initialValue}
          submitLabel={formMode.kind === 'create' ? 'Save address' : 'Save changes'}
          isSubmitting={isSubmitting}
          onCancel={() => setFormMode(null)}
          onSubmit={(value) =>
            formMode.kind === 'create' ? handleCreate(value) : handleUpdate(formMode.address.id, value)
          }
        />
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={{ padding: theme.spacing(2), paddingBottom: 0 }}>
        <Text style={[theme.typography.heading, { color: theme.colors.text }]}>Saved addresses</Text>
      </View>

      {addresses.length === 0 ? (
        <EmptyState
          title="No saved addresses"
          description="Add an address so you can reuse it at checkout."
          action={<Button title="Add address" onPress={() => setFormMode({ kind: 'create' })} />}
        />
      ) : (
        <FlatList
          data={addresses}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: theme.spacing(2) }}
          ListFooterComponent={
            <Button title="Add address" onPress={() => setFormMode({ kind: 'create' })} />
          }
          renderItem={({ item }) => (
            <Card style={{ marginBottom: theme.spacing(1.5) }}>
              <View style={styles.row}>
                <Text style={[theme.typography.subheading, { color: theme.colors.text }]}>{item.fullName}</Text>
                {item.isDefault ? <Badge label="Default" tone="success" /> : null}
              </View>
              <Text style={[theme.typography.body, { color: theme.colors.text, marginTop: theme.spacing(0.5) }]}>
                {item.line1}
                {item.line2 ? `, ${item.line2}` : ''}
              </Text>
              <Text style={[theme.typography.body, { color: theme.colors.text }]}>
                {item.city}, {item.state} {item.postalCode}
              </Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing(0.5) }]}>
                {item.phone}
              </Text>
              <View style={[styles.row, { marginTop: theme.spacing(1.5) }]}>
                <Pressable
                  onPress={() => setFormMode({ kind: 'edit', address: item })}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit address for ${item.fullName}`}
                  style={{ marginRight: theme.spacing(2) }}
                >
                  <Text style={[theme.typography.body, { color: theme.colors.primary, fontWeight: '600' }]}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleDelete(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove address for ${item.fullName}`}
                >
                  <Text style={[theme.typography.body, { color: theme.colors.danger, fontWeight: '600' }]}>Remove</Text>
                </Pressable>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})
