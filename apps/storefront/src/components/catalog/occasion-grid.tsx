import Link from 'next/link'
import type { GiftOccasion } from '@/lib/api/gift-catalog'

export function OccasionGrid({ occasions }: { occasions: GiftOccasion[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      {occasions.map((occasion) => (
        <li key={occasion.id}>
          <Link
            href={`/products?occasion=${encodeURIComponent(occasion.slug)}`}
            className="group flex h-full flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-card transition-colors hover:border-primary/50 hover:bg-secondary/50"
          >
            {occasion.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={occasion.imageUrl} alt="" className="aspect-[4/3] w-full rounded-md object-cover" loading="lazy" />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-12 items-center justify-center rounded-full bg-secondary text-2xl transition-transform group-hover:scale-110"
              >
                {occasion.emoji ?? '🎁'}
              </span>
            )}
            <span className="font-display text-lg font-semibold">{occasion.name}</span>
            {occasion.description ? <span className="text-sm text-muted-foreground">{occasion.description}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  )
}
