'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Loader2, MailCheck } from 'lucide-react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { describedBy, Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { customerApi, registerFormSchema, type RegisterForm as RegisterValues } from '@/lib/api/customer'

export function RegisterForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { displayName: '', email: '', password: '', confirmPassword: '' },
  })

  const signup = useMutation({
    mutationFn: ({ displayName, email, password }: RegisterValues) => customerApi.register({ displayName, email, password }),
  })

  if (signup.isSuccess) {
    return (
      <Card className="w-full max-w-md text-center">
        <CardContent className="grid gap-4 p-8">
          <MailCheck className="mx-auto size-12 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">Check your inbox</h1>
          <p role="status" className="text-muted-foreground">
            If this email can be registered, we’ve sent a verification link. Verify your email, then sign in.
          </p>
          <Button asChild variant="outline">
            <Link href="/account/login">Go to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Create your account</CardTitle>
        <p className="text-sm text-muted-foreground">Save addresses, track orders and personalise gifts.</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((values) => signup.mutate(values))} noValidate className="grid gap-4">
          <Field id="reg-name" label="Your name" error={errors.displayName?.message}>
            <Input
              id="reg-name"
              autoComplete="name"
              aria-invalid={Boolean(errors.displayName)}
              aria-describedby={describedBy('reg-name', errors.displayName?.message)}
              {...register('displayName')}
            />
          </Field>
          <Field id="reg-email" label="Email" error={errors.email?.message}>
            <Input
              id="reg-email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={describedBy('reg-email', errors.email?.message)}
              {...register('email')}
            />
          </Field>
          <Field id="reg-password" label="Password" error={errors.password?.message} hint="At least 8 characters.">
            <Input
              id="reg-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={describedBy('reg-password', errors.password?.message, true)}
              {...register('password')}
            />
          </Field>
          <Field id="reg-confirm" label="Confirm password" error={errors.confirmPassword?.message}>
            <Input
              id="reg-confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirmPassword)}
              aria-describedby={describedBy('reg-confirm', errors.confirmPassword?.message)}
              {...register('confirmPassword')}
            />
          </Field>
          {signup.isError ? (
            <Alert tone="error" title="Couldn’t create your account">
              {signup.error instanceof Error ? signup.error.message : 'Please try again.'}
            </Alert>
          ) : null}
          <Button type="submit" size="lg" disabled={signup.isPending}>
            {signup.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Create account
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/account/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
