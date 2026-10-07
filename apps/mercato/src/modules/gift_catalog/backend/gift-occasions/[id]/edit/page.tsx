import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { OccasionEditForm } from '../../../../components/OccasionForm'

export default function EditGiftOccasionPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <OccasionEditForm id={id} />
      </PageBody>
    </Page>
  )
}
