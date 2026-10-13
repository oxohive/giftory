import { DealerDetailView } from '../../../components/DealerDetailView'

export default function DealerDetailPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null

  return <DealerDetailView dealerProfileId={id} />
}
