import {
  FEAT_DEALER_ORG_ADMIN,
  FEAT_DEALER_ORG_VIEW,
  FEAT_DEALER_ORG_MANAGE_CAPABILITIES,
  FEAT_DEALER_ORG_MANAGE_STAFF,
} from './lib/constants'

export const features = [
  {
    id: FEAT_DEALER_ORG_ADMIN,
    title: 'List and manage active dealers and their capabilities',
    module: 'dealer_org_rbac',
  },
  {
    id: FEAT_DEALER_ORG_VIEW,
    title: 'View own dealer profile and capabilities',
    module: 'dealer_org_rbac',
  },
  {
    id: FEAT_DEALER_ORG_MANAGE_CAPABILITIES,
    title: 'Update own dealer capability configuration',
    module: 'dealer_org_rbac',
    dependsOn: [FEAT_DEALER_ORG_VIEW],
  },
  {
    id: FEAT_DEALER_ORG_MANAGE_STAFF,
    title: 'Invite and manage dealer staff users',
    module: 'dealer_org_rbac',
    dependsOn: [FEAT_DEALER_ORG_VIEW],
  },
]

export default features
