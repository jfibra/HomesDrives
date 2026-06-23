import AdminWorkspaceClient from '@/components/portals/AdminWorkspaceClient'

export const metadata = {
  title: 'Event Workspace · Admin Portal',
  description: 'Manage folders and photos for a drive portal event.',
}

type AdminEventWorkspacePageProps = {
  params: Promise<{ eventSlug: string }>
}

export default async function AdminEventWorkspacePage({ params }: AdminEventWorkspacePageProps) {
  const { eventSlug } = await params
  return <AdminWorkspaceClient eventSlug={eventSlug} />
}
