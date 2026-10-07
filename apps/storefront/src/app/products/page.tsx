import type { Metadata } from 'next'
import Link from 'next/link'
import { ProductGrid } from '@/components/catalog/product-card'
import { ProductFilters, type ProductFilterValues } from '@/components/catalog/product-filters'
import { StateMessage } from '@/components/state-message'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { listCategories, listProducts, safe, type ProductSort } from '@/lib/api/catalog'
import { listOccasions, listProductIdsForOccasion } from '@/lib/api/gift-catalog'
import { UUID_RE } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'All gifts',
  description: 'Browse personalised and ready-to-gift products for every occasion.',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value
  return v && v.trim() ? v.trim() : undefined
}

function rupeesToMinor(value: string | undefined): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined
}

const SORTS: ProductSort[] = ['newest', 'title', 'price-asc', 'price-desc']

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const values: ProductFilterValues = {
    q: first(params.q),
    category: first(params.category),
    occasion: first(params.occasion),
    min: first(params.min),
    max: first(params.max),
    sort: first(params.sort),
  }
  const page = Math.max(1, Number(first(params.page)) || 1)
  const sort = SORTS.find((s) => s === values.sort) ?? 'newest'

  const [categoriesRes, occasionsRes, occasionIds] = await Promise.all([
    safe(listCategories()),
    listOccasions(),
    values.occasion ? listProductIdsForOccasion(values.occasion) : Promise.resolve(null),
  ])
  const occasionFilterUnavailable = Boolean(values.occasion) && occasionIds === null

  const productsRes = await safe(
    listProducts({
      search: values.q,
      categoryId: values.category && UUID_RE.test(values.category) ? values.category : undefined,
      ids: occasionIds ?? undefined,
      page,
      pageSize: 24,
      sort,
      minPriceMinor: rupeesToMinor(values.min),
      maxPriceMinor: rupeesToMinor(values.max),
    }),
  )

  const occasionName = occasionsRes.occasions.find((o) => o.slug === values.occasion)?.name
  const heading = values.q ? `Results for “${values.q}”` : occasionName ? `${occasionName} gifts` : 'All gifts'

  const pageHref = (p: number) => {
    const qs = new URLSearchParams()
    for (const [key, value] of Object.entries(values)) if (value) qs.set(key, value)
    if (p > 1) qs.set('page', String(p))
    const s = qs.toString()
    return s ? `/products?${s}` : '/products'
  }

  return (
    <div className="container-page py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
        <ol className="flex gap-2">
          <li>
            <Link href="/" className="hover:text-foreground">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground">
            Gifts
          </li>
        </ol>
      </nav>
      <h1 className="mb-6 text-3xl font-semibold">{heading}</h1>
      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        <aside>
          <details className="rounded-lg border border-border bg-surface p-4 lg:hidden">
            <summary className="cursor-pointer font-medium">Filters &amp; sorting</summary>
            <div className="mt-4">
              <ProductFilters values={values} categories={categoriesRes.data ?? []} occasions={occasionsRes.occasions} />
            </div>
          </details>
          <div className="sticky top-24 hidden rounded-lg border border-border bg-surface p-5 lg:block">
            <ProductFilters values={values} categories={categoriesRes.data ?? []} occasions={occasionsRes.occasions} />
          </div>
        </aside>
        <section aria-label="Products" className="grid content-start gap-6">
          {occasionFilterUnavailable ? (
            <Alert tone="info" title="Occasion filter coming soon">
              Occasion tags aren’t available yet, so we’re showing all gifts.
            </Alert>
          ) : null}
          {productsRes.error !== null ? (
            <StateMessage
              kind="error"
              title="We couldn’t load gifts"
              action={
                <Button asChild variant="outline">
                  <Link href={pageHref(page)}>Try again</Link>
                </Button>
              }
            >
              The store backend didn’t respond. Please try again in a moment.
            </StateMessage>
          ) : productsRes.data.items.length === 0 ? (
            <StateMessage
              title="No gifts match your filters"
              action={
                <Button asChild variant="outline">
                  <Link href="/products">Clear filters</Link>
                </Button>
              }
            >
              Try a different search, occasion or price range.
            </StateMessage>
          ) : (
            <>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {productsRes.data.total} {productsRes.data.total === 1 ? 'gift' : 'gifts'}
              </p>
              <ProductGrid products={productsRes.data.items} />
              {productsRes.data.totalPages > 1 ? (
                <nav aria-label="Pagination" className="flex items-center justify-center gap-3">
                  {page > 1 ? (
                    <Button asChild variant="outline">
                      <Link href={pageHref(page - 1)} rel="prev">
                        Previous
                      </Link>
                    </Button>
                  ) : null}
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {productsRes.data.totalPages}
                  </span>
                  {page < productsRes.data.totalPages ? (
                    <Button asChild variant="outline">
                      <Link href={pageHref(page + 1)} rel="next">
                        Next
                      </Link>
                    </Button>
                  ) : null}
                </nav>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
