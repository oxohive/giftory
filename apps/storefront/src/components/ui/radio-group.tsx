'use client'

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function RadioGroup({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root className={cn('grid gap-3', className)} {...props} />
}

/** A full-width selectable card; the label wraps the radio so the whole card is clickable. */
export function RadioCard({
  value,
  id,
  className,
  children,
  disabled,
}: {
  value: string
  id: string
  className?: string
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface p-4 transition-colors hover:bg-surface-muted has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:ring-1 has-[[data-state=checked]]:ring-primary',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <RadioGroupPrimitive.Item
        id={id}
        value={value}
        disabled={disabled}
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-input bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=checked]:border-primary"
      >
        <RadioGroupPrimitive.Indicator className="size-2.5 rounded-full bg-primary" />
      </RadioGroupPrimitive.Item>
      <span className="grid flex-1 gap-0.5">{children}</span>
    </label>
  )
}
