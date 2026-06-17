import PublicWorkspaceClient from '@/components/portals/PublicWorkspaceClient'
import { Suspense } from 'react'

export const metadata = {
  title: 'Public Download · Temporary Portal',
  description: 'Temporary public download portal.',
}

export default function PublicPortalPage() {
  return (
    <Suspense fallback={null}>
      <PublicWorkspaceClient />
    </Suspense>
  )
}
