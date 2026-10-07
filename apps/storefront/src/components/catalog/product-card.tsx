import { Sparkles } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import type { ProductSummary } from '@/lib/api/catalog.schemas'
import { Price } from './price'
import { ProductImage } from './product-image'

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-card transition-shadow hover:shadow-lg">
      <div className="relative overflow-hidden">
        <ProductImage
          src={product.imageUrl}
          alt=""
          className="transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {product.isConfigurable ? (
          <Badge variant="accent" className="absolute left-3 top-3">
            <Sparkles aria-hidden="true" /> Personalise
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="font-sans text-base font-medium leading-snug">
          <Link
            href={`/products/${encodeURIComponent(product.slug)}`}
            className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-ring"
          >
            {product.title}
          </Link>
        </h3>
        {product.subtitle ? <p className="line-clamp-2 text-sm text-muted-foreground">{product.subtitle}</p> : null}
        <p className="mt-auto pt-2 font-semibold">
          <Price minor={product.priceMinor} currency={product.currency} />
        </p>
      </div>
    </article>
  )
}

export function ProductGrid({ products }: { products: ProductSummary[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <li key={product.id} className="flex">
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  )
}
