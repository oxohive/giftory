import { ArrowRight, Gift, Heart, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { OccasionGrid } from '@/components/catalog/occasion-grid'
import { ProductGrid } from '@/components/catalog/product-card'
import { StateMessage } from '@/components/state-message'
import { Button } from '@/components/ui/button'
import { listProducts, safe } from '@/lib/api/catalog'
import { listOccasions } from '@/lib/api/gift-catalog'
import { siteConfig } from '@/lib/site'

// Catalog data is fetched per request (cached in Next's data cache for 2 min), so builds never
// need a live backend and an unreachable backend renders a friendly state instead of failing.
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [{ occasions }, featured] = await Promise.all([listOccasions(), safe(listProducts({ pageSize: 8 }))])

  return (
    <>
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-secondary via-background to-accent/25">
        <div className="container-page grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-2">
          <div className="grid gap-6">
            <p className="inline-flex w-fit items-center gap-2 rounded-full bg-surface/80 px-3 py-1 text-sm font-medium text-primary shadow-sm">
              <Sparkles className="size-4" aria-hidden="true" /> Personalised gifting, made easy
            </p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
              Gifts that say <span className="text-primary">exactly</span> what you mean.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">{siteConfig.description}</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/products">
                  Shop all gifts <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#occasions">Shop by occasion</a>
              </Button>
            </div>
          </div>
          <div aria-hidden="true" className="relative mx-auto hidden aspect-square w-full max-w-md lg:block">
            <div className="absolute inset-6 rotate-6 rounded-[2rem] bg-primary/15" />
            <div className="absolute inset-6 -rotate-3 rounded-[2rem] bg-accent/40" />
            <div className="absolute inset-6 flex items-center justify-center rounded-[2rem] border border-border bg-surface shadow-card">
              <Gift className="size-32 text-primary" strokeWidth={1.25} />
              <Heart className="absolute right-10 top-10 size-10 fill-primary/20 text-primary" />
              <Sparkles className="absolute bottom-12 left-10 size-10 text-accent-foreground" />
            </div>
          </div>
        </div>
      </section>

      <section id="occasions" aria-labelledby="occasions-heading" className="container-page scroll-mt-20 py-12">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 id="occasions-heading" className="text-2xl font-semibold sm:text-3xl">
              Shop by occasion
            </h2>
            <p className="text-muted-foreground">Find the perfect gift for every moment.</p>
          </div>
        </div>
        <OccasionGrid occasions={occasions} />
      </section>

      <section aria-labelledby="featured-heading" className="container-page py-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 id="featured-heading" className="text-2xl font-semibold sm:text-3xl">
              Featured gifts
            </h2>
            <p className="text-muted-foreground">Fresh picks our customers love.</p>
          </div>
          <Link href="/products" className="hidden text-sm font-medium text-primary hover:underline sm:inline">
            View all
          </Link>
        </div>
        {featured.error !== null ? (
          <StateMessage kind="error" title="We couldn’t load gifts right now">
            Our catalogue is taking a break. Please refresh in a moment.
          </StateMessage>
        ) : featured.data.items.length === 0 ? (
          <StateMessage title="New gifts are on their way">Check back soon — we’re wrapping up our collection.</StateMessage>
        ) : (
          <ProductGrid products={featured.data.items} />
        )}
      </section>
    </>
  )
}
