'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { StateMessage } from '@/components/state-message'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { describedBy, Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { customerApi } from '@/lib/api/customer'

const schema = z
  .object({
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

export function ResetPasswordForm({ token }: { token: string | null }) {
  const reset = useMutation({
    mutationFn: (values: FormValues) => customerApi.confirmPasswordReset(token!, values.newPassword),
  })
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  if (!token) {
    return (
      <StateMessage
        kind="error"
        title="This link is invalid or has expired"
        action={
          <Button asChild variant="outline">
            <Link href="/account/login">Back to sign in</Link>
          </Button>
        }
      >
        Password reset links expire after 24 hours. Request a new one from the sign-in page.
      </StateMessage>
    )
  }

  if (reset.isSuccess) {
    return (
      <div className="grid justify-items-center gap-4 text-center" role="status">
        <CheckCircle2 className="size-12 text-success" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">Password updated</h1>
        <p className="text-muted-foreground">You can now sign in with your new password.</p>
        <Button asChild>
          <Link href="/account/login">Sign in</Link>
        </Button>
      </div>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit((values) => reset.mutate(values))}
          className="grid gap-4"
          aria-describedby={reset.isError ? 'reset-error' : undefined}
        >
          {reset.isError && (
            <Alert id="reset-error" tone="error" title="Could not reset password">
              This link may have expired. Request a new reset link from the sign-in page.
            </Alert>
          )}
          <Field id="reset-new-password" label="New password" error={errors.newPassword?.message}>
            <Input
              id="reset-new-password"
              type="password"
              autoComplete="new-password"
              aria-describedby={describedBy('reset-new-password', errors.newPassword?.message)}
              aria-invalid={Boolean(errors.newPassword)}
              {...register('newPassword')}
            />
          </Field>
          <Field id="reset-confirm-password" label="Confirm new password" error={errors.confirmPassword?.message}>
            <Input
              id="reset-confirm-password"
              type="password"
              autoComplete="new-password"
              aria-describedby={describedBy('reset-confirm-password', errors.confirmPassword?.message)}
              aria-invalid={Boolean(errors.confirmPassword)}
              {...register('confirmPassword')}
            />
          </Field>
          <Button type="submit" disabled={isSubmitting || reset.isPending}>
            {reset.isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
            Set new password
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/account/login" className="underline underline-offset-4">
              Back to sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
