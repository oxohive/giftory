export const features = [
  {
    id: 'dealer_onboarding.admin',
    title: 'Manage dealer applications (review, approve, reject)',
    module: 'dealer_onboarding',
  },
  {
    id: 'dealer_onboarding.view_own',
    title: 'View own dealer application status',
    module: 'dealer_onboarding',
    dependsOn: [],
  },
  {
    id: 'dealer_onboarding.submit',
    title: 'Submit or update dealer registration and KYC documents',
    module: 'dealer_onboarding',
    dependsOn: ['dealer_onboarding.view_own'],
  },
]

export default features
