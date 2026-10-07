import { SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Category } from '@/lib/api/catalog.schemas'
import type { GiftOccasion } from '@/lib/api/gift-catalog'

export type ProductFilterValues = {
  q?: string
  category?: string
  occasion?: string
  min?: string
  max?: string
  sort?: string
}

/**
 * Plain GET form: works without JavaScript and keeps filters in the URL (shareable, crawlable).
 */
export function ProductFilters({
  values,
  categories,
  occasions,
}: {
  values: ProductFilterValues
  categories: Category[]
  occasions: GiftOccasion[]
}) {
  return (
    <form method="get" action="/products" aria-label="Filter gifts" className="grid gap-5">
      <h2 className="flex items-center gap-2 font-sans text-base font-semibold">
        <SlidersHorizontal className="size-4" aria-hidden="true" /> Filters
      </h2>
      <div className="grid gap-1.5">
        <Label htmlFor="filter-q">Search</Label>
        <Input id="filter-q" name="q" type="search" defaultValue={values.q} placeholder="e.g. mug, hamper" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="filter-occasion">Occasion</Label>
        <Select id="filter-occasion" name="occasion" defaultValue={values.occasion ?? ''}>
          <option value="">Any occasion</option>
          {occasions.map((o) => (
            <option key={o.id} value={o.slug}>
              {o.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="filter-category">Category</Label>
        <Select id="filter-category" name="category" defaultValue={values.category ?? ''}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {'— '.repeat(c.depth)}
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Price (₹)</legend>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="filter-min" className="sr-only">
              Minimum price in rupees
            </label>
            <Input id="filter-min" name="min" type="number" inputMode="numeric" min={0} step={1} placeholder="Min" defaultValue={values.min} />
          </div>
          <div>
            <label htmlFor="filter-max" className="sr-only">
              Maximum price in rupees
            </label>
            <Input id="filter-max" name="max" type="number" inputMode="numeric" min={0} step={1} placeholder="Max" defaultValue={values.max} />
          </div>
        </div>
      </fieldset>
      <div className="grid gap-1.5">
        <Label htmlFor="filter-sort">Sort by</Label>
        <Select id="filter-sort" name="sort" defaultValue={values.sort ?? 'newest'}>
          <option value="newest">Newest</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
          <option value="title">Name</option>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1">
          Apply
        </Button>
        <Button asChild variant="outline">
          <Link href="/products">Reset</Link>
        </Button>
      </div>
    </form>
  )
}
