import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [
  { id: 'dealer_onboarding.profile.registered', label: 'Dealer Registration Submitted', entity: 'profile', category: 'lifecycle' },
  { id: 'dealer_onboarding.profile.approved', label: 'Dealer Application Approved', entity: 'profile', category: 'lifecycle' },
  { id: 'dealer_onboarding.profile.rejected', label: 'Dealer Application Rejected', entity: 'profile', category: 'lifecycle' },
  { id: 'dealer_onboarding.profile.resubmitted', label: 'Dealer Application Resubmitted', entity: 'profile', category: 'lifecycle' },
  { id: 'dealer_onboarding.document.uploaded', label: 'Dealer KYC Document Uploaded', entity: 'document', category: 'crud' },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'dealer_onboarding',
  events,
})

export type DealerOnboardingEventId = (typeof events)[number]['id']

export default eventsConfig
