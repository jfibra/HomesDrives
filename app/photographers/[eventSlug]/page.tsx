import PhotographerWorkspaceClient from '@/components/portals/PhotographerWorkspaceClient'

export const metadata = {
  title: 'Photographer Portal · Temporary',
  description: 'Temporary open photographer workspace.',
}

type PhotographerEventPageProps = {
  params: Promise<{ eventSlug: string }>
}

export default async function PhotographerEventPortalPage({ params }: PhotographerEventPageProps) {
  const { eventSlug } = await params
  return <PhotographerWorkspaceClient eventSlug={eventSlug} />
}
