import { Gift } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Product media is served by Open Mercato's public attachments route
 * (/api/attachments/image/{id}/...). A plain <img> is used so images from any configured
 * backend origin work without next/image domain configuration.
 */
export function ProductImage({
  src,
  alt,
  className,
  priority = false,
}: {
  src: string | null
  alt: string
  className?: string
  priority?: boolean
}) {
  if (!src) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn(
          'flex aspect-square w-full items-center justify-center bg-gradient-to-br from-secondary to-accent/40 text-primary',
          className,
        )}
      >
        <Gift className="size-12 opacity-70" aria-hidden="true" />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className={cn('aspect-square w-full bg-surface-muted object-cover', className)}
    />
  )
}
