'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { describedBy, Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { customerApi, profileFormSchema, type CustomerProfile, type ProfileForm } from '@/lib/api/customer'
import { useInvalidateCustomer } from '@/lib/auth/use-customer'
import { AccountShell } from './account-shell'

function ProfileCard({ profile }: { profile: CustomerProfile }) {
  const invalidate = useInvalidateCustomer()
  // PUT /portal/profile requires the customer feature `portal.account.manage`; a 403 surfaces as an error below.
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { displayName: profile.user.displayName },
  })
  const save = useMutation({ mutationFn: customerApi.updateProfile, onSuccess: () => invalidate() })

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="grid max-w-md gap-4">
            <Field id="profile-name" label="Name" error={errors.displayName?.message}>
              <Input
                id="profile-name"
                autoComplete="name"
                aria-invalid={Boolean(errors.displayName)}
                aria-describedby={describedBy('profile-name', errors.displayName?.message)}
                {...register('displayName')}
              />
            </Field>
            <Field id="profile-email" label="Email" hint={profile.user.emailVerified ? 'Verified' : 'Not verified yet'}>
              <Input id="profile-email" type="email" value={profile.user.email} readOnly aria-describedby="profile-email-hint" />
            </Field>
            {save.isError ? (
              <Alert tone="error" title="Couldn’t save">
                {save.error instanceof Error ? save.error.message : 'Please try again.'}
              </Alert>
            ) : null}
            {save.isSuccess && !isDirty ? <Alert tone="success" title="Saved" /> : null}
            <Button type="submit" className="w-fit" disabled={save.isPending || !isDirty}>
              {save.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>
      {profile.user.customerEntityId ? null : (
        <Alert tone="info" title="Order history is being linked">
          Your account isn’t linked to a customer record yet, so past orders may not appear. Contact us if an order is
          missing.
        </Alert>
      )}
    </div>
  )
}

export function ProfileView() {
  return <AccountShell title="My account">{(profile) => <ProfileCard profile={profile} />}</AccountShell>
}
