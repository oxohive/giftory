import ApplicationDetailPage from '../../../../components/ApplicationDetailPage'

export default function DealerApplicationDetailPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null

  return <ApplicationDetailPage applicationId={id} />
}
