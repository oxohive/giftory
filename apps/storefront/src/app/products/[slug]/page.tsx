import { Brush, ShieldCheck, Truck } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { AddToCartForm } from '@/components/catalog/add-to-cart-form'
import { ProductImage } from '@/components/catalog/product-image'
import { StateMessage } from '@/components/state-message'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getProductBySlug, safe } from '@/lib/api/catalog'
import { getGiftProfile } from '@/lib/api/gift-catalog'
import { publicEnv } from '@/lib/env.public'
import { siteConfig } from '@/lib/site'

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

const loadProduct = cache((slug: string) => safe(getProductBySlug(slug)))

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const res = await loadProduct(decodeURIComponent(slug))
  if (!res.data) return { title: 'Gift' }
  const p = res.data
  return {
    title: p.seoTitle ?? p.title,
    description: p.seoDescription ?? p.subtitle ?? siteConfig.description,
    alternates: { canonical: `/products/${encodeURIComponent(p.slug)}` },
    openGraph: { title: p.title, images: p.imageUrl ? [p.imageUrl] : undefined },
  }
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params
  const res = await loadProduct(decodeURIComponent(slug))

  if (res.error !== null) {
    return (
      <div className="container-page py-12">
        <StateMessage
          kind="error"
          title="We couldn’t load this gift"
          action={
            <Button asChild variant="outline">
              <Link href="/products">Browse all gifts</Link>
            </Button>
          }
        >
          The store backend didn’t respond. Please try again in a moment.
        </StateMessage>
      </div>
    )
  }
  const product = res.data
  if (!product) notFound()

  const { profile } = await getGiftProfile(product.id)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.seoDescription ?? product.description ?? undefined,
    sku: product.sku ?? undefined,
    image: product.imageUrl ?? undefined,
    offers:
      product.priceMinor !== null
        ? {
            '@type': 'Offer',
            priceCurrency: product.currency,
            price: (product.priceMinor / 100).toFixed(2),
            availability: 'https://schema.org/InStock',
            url: `${publicEnv.siteUrl}/products/${encodeURIComponent(product.slug)}`,
          }
        : undefined,
  }

  return (
    <div className="container-page py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
        <ol className="flex flex-wrap gap-2">
          <li>
            <Link href="/" className="hover:text-foreground">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/products" className="hover:text-foreground">
              Gifts
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground">
            {product.title}
          </li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <ProductImage src={product.imageUrl} alt={product.title} priority />
        </div>
        <div className="grid content-start gap-6">
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              {profile.isCustomizable ? (
                <Badge variant="accent">
                  <Brush aria-hidden="true" /> Customizable — 3D designer coming soon
                </Badge>
              ) : null}
              {profile.proofRequired ? <Badge variant="outline">Design proof before production</Badge> : null}
              {product.categories.map((c) => (
                <Badge key={c.id}>{c.name}</Badge>
              ))}
            </div>
            <h1 className="text-3xl font-semibold sm:text-4xl">{product.title}</h1>
            {product.subtitle ? <p className="text-lg text-muted-foreground">{product.subtitle}</p> : null}
          </div>

          <AddToCartForm product={product} giftProfile={profile} />

          <ul className="grid gap-3 border-t border-border pt-6 text-sm">
            <li className="flex items-center gap-3">
              <Truck className="size-5 text-primary" aria-hidden="true" /> Delivery across India, tracked end-to-end
            </li>
            <li className="flex items-center gap-3">
              <ShieldCheck className="size-5 text-primary" aria-hidden="true" /> Secure payment with Stripe or Razorpay (UPI, cards, net banking)
            </li>
          </ul>

          {product.description ? (
            <section aria-labelledby="description-heading" className="grid gap-2 border-t border-border pt-6">
              <h2 id="description-heading" className="text-xl font-semibold">
                About this gift
              </h2>
              <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{product.description}</p>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
