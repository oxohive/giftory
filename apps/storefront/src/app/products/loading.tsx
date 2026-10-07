import { Skeleton } from '@/components/ui/skeleton'

export default function ProductsLoading() {
  return (
    <div className="container-page py-8" aria-busy="true">
      <span className="sr-only" role="status">
        Loading gifts…
      </span>
      <Skeleton className="mb-6 h-9 w-48" />
      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        <Skeleton className="hidden h-96 lg:block" />
        <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="grid gap-2">
              <Skeleton className="aspect-square w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
