'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { describedBy, Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { customerApi, loginFormSchema, type LoginForm as LoginValues } from '@/lib/api/customer'
import { useInvalidateCustomer } from '@/lib/auth/use-customer'

/** Only allow same-site relative redirects after login. */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/account'
  return next
}

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const invalidate = useInvalidateCustomer()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginFormSchema), defaultValues: { email: '', password: '' } })

  const login = useMutation({
    mutationFn: customerApi.login,
    onSuccess: async () => {
      await invalidate()
      router.replace(safeNext(params.get('next')))
      router.refresh()
    },
  })

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <p className="text-sm text-muted-foreground">Sign in to track orders and check out faster.</p>
      </CardHeader>
      <CardContent>
        {params.get('verified') === '1' ? (
          <Alert tone="success" title="Email verified" className="mb-4">
            You can now sign in.
          </Alert>
        ) : null}
        <form onSubmit={handleSubmit((values) => login.mutate(values))} noValidate className="grid gap-4">
          <Field id="login-email" label="Email" error={errors.email?.message}>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={describedBy('login-email', errors.email?.message)}
              {...register('email')}
            />
          </Field>
          <Field id="login-password" label="Password" error={errors.password?.message}>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={describedBy('login-password', errors.password?.message)}
              {...register('password')}
            />
          </Field>
          {login.isError ? (
            <Alert tone="error" title="Couldn’t sign you in">
              {login.error instanceof Error ? login.error.message : 'Please try again.'} If you just registered, verify your
              email first.
            </Alert>
          ) : null}
          <Button type="submit" size="lg" disabled={login.isPending}>
            {login.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Sign in
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New here?{' '}
          <Link href="/account/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
