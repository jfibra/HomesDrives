import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import AdminEventWorkspaceShell from '@/components/portals/AdminEventWorkspaceShell'
import EventPhotographerBrowser from '@/components/portals/EventPhotographerBrowser'
import { getAdminEventPhotographersPath } from '@/lib/portals/constants'
import {
  getEventPhotographerById,
  getEventPhotographerWorkspace,
} from '@/lib/portals/event-photographers'
import { requirePortalEventBySlug } from '@/lib/portals/events'

type AdminEventPhotographerDetailPageProps = {
  params: Promise<{ eventSlug: string; photographerId: string }>
}

export default async function AdminEventPhotographerDetailPage({
  params,
}: AdminEventPhotographerDetailPageProps) {
  const { eventSlug, photographerId } = await params

  let event
  try {
    event = await requirePortalEventBySlug(eventSlug)
  } catch {
    notFound()
  }

  const photographer = await getEventPhotographerById(photographerId)
  if (!photographer || photographer.portal_event_id !== event.id) {
    notFound()
  }

  let workspace: Awaited<ReturnType<typeof getEventPhotographerWorkspace>> | null = null
  let loadError = ''

  try {
    workspace = await getEventPhotographerWorkspace({
      eventId: event.id,
      photographerId: photographer.id,
    })
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load photographer workspace.'
  }

  return (
    <AdminEventWorkspaceShell activeTab="photographers" event={event}>
      <div className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/75 p-5 shadow-[0_20px_60px_-12px_rgba(16,35,63,0.12)] backdrop-blur-sm sm:p-8">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-[#10233f]"
          href={getAdminEventPhotographersPath(event.slug)}
        >
          <ChevronLeft className="h-4 w-4" />
          All photographers
        </Link>

        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Photographer</p>
          <h2 className="mt-2 text-2xl font-semibold text-[#10233f] sm:text-3xl">{photographer.full_name}</h2>
          <p className="mt-2 text-sm text-slate-500">
            {workspace?.photoCount ?? photographer.photo_count} photo
            {(workspace?.photoCount ?? photographer.photo_count) === 1 ? '' : 's'} captured for {event.name}
          </p>
        </div>

        {loadError ? (
          <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        ) : null}

        {workspace ? (
          <EventPhotographerBrowser
            folders={workspace.folders}
            photographerName={photographer.full_name}
            photosByFolderId={workspace.photosByFolderId}
            tree={workspace.tree}
          />
        ) : null}
      </div>
    </AdminEventWorkspaceShell>
  )
}
