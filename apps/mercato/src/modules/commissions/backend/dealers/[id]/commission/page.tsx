import { DealerCommissionHistoryPage } from '../../../../components/DealerCommissionHistoryPage'

export default function DealerCommissionPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null

  return <DealerCommissionHistoryPage dealerProfileId={id} />
}
