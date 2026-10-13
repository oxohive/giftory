import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import OrderCommissionTabWidget from './widget.client'

const widget: InjectionWidgetModule<{ kind?: 'order' | 'quote'; record?: { id?: string }; resourceId?: string }> = {
  metadata: {
    id: 'commissions.injection.order-commission-tab',
    title: 'Order commission',
    description: 'Read-only tab showing the frozen commission rate/amount for this order, if one was assigned to a dealer.',
    features: ['commissions.view'],
    requiredModules: ['sales'],
  },
  Widget: OrderCommissionTabWidget,
}

export default widget
