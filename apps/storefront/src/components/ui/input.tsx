import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const fieldClass =
  'w-full rounded-md border border-input bg-surface px-3 text-base text-foreground placeholder:text-muted-foreground/80 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-60 aria-[invalid=true]:border-danger sm:text-sm'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(fieldClass, 'h-11', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(fieldClass, 'min-h-24 py-2', className)} {...props} />
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(fieldClass, 'h-11 pr-8', className)} {...props} />
}
