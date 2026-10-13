import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { CommissionRuleCreateForm } from '../../../components/CommissionRuleCreateForm'

export default function CreateCommissionRulePage() {
  return (
    <Page>
      <PageBody>
        <CommissionRuleCreateForm />
      </PageBody>
    </Page>
  )
}
