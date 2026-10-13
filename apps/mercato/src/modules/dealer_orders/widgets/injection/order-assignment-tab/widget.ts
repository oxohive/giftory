import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import OrderAssignmentTabWidget from './widget.client'

const widget: InjectionWidgetModule<{ kind?: 'order' | 'quote'; record?: { id?: string }; resourceId?: string }> = {
  metadata: {
    id: 'dealer_orders.injection.order-assignment-tab',
    title: 'Dealer assignment',
    description: 'Shows the current dealer assignment for this order and lets admins assign/reassign/cancel it.',
    features: ['dealer_orders.view'],
    requiredModules: ['sales'],
  },
  Widget: OrderAssignmentTabWidget,
}

export default widget
