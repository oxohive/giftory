export const features = [
  { id: 'commissions.view', title: 'View commission rules and snapshots', module: 'commissions' },
  {
    id: 'commissions.manage',
    title: 'Create and deactivate commission rules',
    module: 'commissions',
    dependsOn: ['commissions.view'],
  },
  {
    id: 'commissions.dealer_access',
    title: 'View own commission earnings (dealer portal)',
    module: 'commissions',
  },
]

export default features
