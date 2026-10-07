import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import ProductGiftProfileWidget from './widget.client'

const widget: InjectionWidgetModule = {
  metadata: {
    id: 'gift_catalog.injection.product-gift-profile',
    title: 'Gift profile',
    description: 'Occasions, recipients, personalization and fulfillment for this product.',
    features: ['gift_catalog.view'],
    requiredModules: ['catalog'],
    priority: 110,
    enabled: true,
  },
  Widget: ProductGiftProfileWidget,
}

export default widget
