'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, MapPin, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { AddressFields } from '@/components/checkout/address-fields'
import { StateMessage } from '@/components/state-message'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { addressesApi, addressSchema, formatAddress, type AddressInput } from '@/lib/api/addresses'
import { AccountShell } from './account-shell'

function AddressForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddressInput>({
    resolver: zodResolver(addressSchema),
    defaultValues: { fullName: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: 'IN' },
  })
  const create = useMutation({
    mutationFn: (input: AddressInput) => addressesApi.create(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['addresses'] })
      onDone()
    },
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>New address</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((v) => create.mutate(v))} noValidate className="grid gap-4">
          <AddressFields idPrefix="new-address" prefix="" register={register} errors={errors} />
          {create.isError ? (
            <Alert tone="error" title="Couldn’t save the address">
              {create.error instanceof Error ? create.error.message : 'Please try again.'}
            </Alert>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Save address
            </Button>
            <Button variant="outline" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function AddressList() {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: () => addressesApi.list() })
  const remove = useMutation({
    mutationFn: (id: string) => addressesApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['addresses'] }),
  })

  if (addresses.isLoading) {
    return (
      <div className="grid gap-3" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }
  if (addresses.isError) {
    return (
      <StateMessage kind="error" title="We couldn’t load your addresses">
        {addresses.error instanceof Error ? addresses.error.message : 'Please try again.'}
      </StateMessage>
    )
  }

  const items = addresses.data?.items ?? []
  return (
    <div className="grid gap-4">
      {addresses.data?.source === 'device' ? (
        <Alert tone="info" title="Saved on this device">
          Your address book is stored in this browser until account address sync is available.
        </Alert>
      ) : null}
      {items.length === 0 && !adding ? (
        <StateMessage
          title="No saved addresses yet"
          action={
            <Button onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" /> Add an address
            </Button>
          }
        >
          Save addresses for faster checkout — yours and your loved ones’.
        </StateMessage>
      ) : null}
      {items.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((a) => (
            <li key={a.id}>
              <Card className="h-full">
                <CardContent className="grid gap-2 p-5">
                  <p className="flex items-center gap-2 font-medium">
                    <MapPin className="size-4 text-primary" aria-hidden="true" /> {a.fullName}
                    {a.isDefault ? <Badge>Default</Badge> : null}
                  </p>
                  <p className="text-sm text-muted-foreground">{formatAddress(a)}</p>
                  <p className="text-sm text-muted-foreground">{a.phone}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-fit text-muted-foreground"
                    onClick={() => remove.mutate(a.id)}
                    disabled={remove.isPending}
                    aria-label={`Delete address for ${a.fullName}`}
                  >
                    <Trash2 aria-hidden="true" /> Delete
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
      {adding ? (
        <AddressForm onDone={() => setAdding(false)} />
      ) : items.length > 0 ? (
        <Button variant="outline" className="w-fit" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" /> Add another address
        </Button>
      ) : null}
    </div>
  )
}

export function AddressesView() {
  return <AccountShell title="Addresses">{() => <AddressList />}</AccountShell>
}
