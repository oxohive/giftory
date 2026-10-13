import { DealerLedgerPage } from '../../../../components/DealerLedgerPage'

export default function PayoutsDealerLedgerPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null

  return <DealerLedgerPage dealerProfileId={id} />
}
