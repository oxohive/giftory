import { formatProductionRequirements } from '@/lib/features/orders/detail'
import type { OrderDetailLine } from '@/lib/features/orders/detail'

/**
 * Renders exactly the per-line fields FEAT-010 allows: product/variant name, quantity, gift
 * message and production requirements. Reads each field off `OrderDetailLine` by name — never
 * spreads or iterates the raw line object — so a backend field this task hasn't reviewed can
 * never silently start rendering here.
 */
export function OrderLineItems({ lines }: { lines: OrderDetailLine[] }) {
  if (lines.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted-foreground">
        No line-item details are available for this order.
      </section>
    )
  }

  return (
    <section className="grid gap-3">
      <h2 className="text-sm font-semibold text-foreground">Order lines</h2>
      <ul className="grid gap-3">
        {lines.map((line) => {
          const requirements = formatProductionRequirements(line.productionRequirements)
          return (
            <li key={line.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium text-foreground">{line.name ?? 'Item'}</p>
                <p className="shrink-0 text-sm text-muted-foreground">Qty {line.quantity}</p>
              </div>

              {line.giftMessage ? (
                <p className="mt-2 text-sm text-foreground">
                  <span className="font-medium">Gift message: </span>
                  {line.giftMessage}
                </p>
              ) : null}

              {requirements.length > 0 ? (
                <dl className="mt-3 grid gap-1 text-sm">
                  {requirements.map((entry) => (
                    <div key={entry.label} className="flex gap-2">
                      <dt className="shrink-0 text-muted-foreground">{entry.label}</dt>
                      <dd className="text-foreground">{entry.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
