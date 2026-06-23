import PublicWorkspaceClient from '@/components/portals/PublicWorkspaceClient'
import { Suspense } from 'react'

export const metadata = {
  title: 'Public Download · Temporary Portal',
  description: 'Temporary public download portal.',
}

type PublicEventPageProps = {
  params: Promise<{ eventSlug: string }>
}

export default async function PublicEventPortalPage({ params }: PublicEventPageProps) {
  const { eventSlug } = await params
  return (
    <Suspense fallback={null}>
      <PublicWorkspaceClient eventSlug={eventSlug} />
    </Suspense>
  )
}
