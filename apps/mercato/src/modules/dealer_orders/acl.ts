export const features = [
  { id: 'dealer_orders.view', title: 'View dealer order assignments', module: 'dealer_orders' },
  {
    id: 'dealer_orders.manage',
    title: 'Assign, reassign and cancel dealer order assignments',
    module: 'dealer_orders',
    dependsOn: ['dealer_orders.view'],
  },
  {
    id: 'dealer_orders.dealer_access',
    title: 'Access the dealer-facing order API (dealer portal)',
    module: 'dealer_orders',
  },
]

export default features
