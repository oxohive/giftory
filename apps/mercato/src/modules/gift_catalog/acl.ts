export const features = [
  { id: 'gift_catalog.view', title: 'View gift catalog metadata and occasions', module: 'gift_catalog' },
  {
    id: 'gift_catalog.manage',
    title: 'Manage gift catalog metadata and occasions',
    module: 'gift_catalog',
    dependsOn: ['gift_catalog.view'],
  },
]

export default features
