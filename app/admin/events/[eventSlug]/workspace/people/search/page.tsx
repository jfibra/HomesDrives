import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { notFound } from 'next/navigation'

import AdminEventWorkspaceShell from '@/components/portals/AdminEventWorkspaceShell'
import FaceSearchClient from '@/components/people/FaceSearchClient'
import { getAdminEventPeoplePath, PORTAL_API_BASE } from '@/lib/portals/constants'
import { requirePortalEventBySlug } from '@/lib/portals/events'

type AdminEventPeopleSearchPageProps = {
  params: Promise<{ eventSlug: string }>
}

export default async function AdminEventPeopleSearchPage({ params }: AdminEventPeopleSearchPageProps) {
  const { eventSlug } = await params

  let event
  try {
    event = await requirePortalEventBySlug(eventSlug)
  } catch {
    notFound()
  }

  const peopleBasePath = getAdminEventPeoplePath(event.slug)
  const searchUrl = `${PORTAL_API_BASE}/admin/events/${encodeURIComponent(event.id)}/people/search`

  return (
    <AdminEventWorkspaceShell activeTab="people" event={event}>
      <div className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/75 p-5 shadow-[0_20px_60px_-12px_rgba(16,35,63,0.12)] backdrop-blur-sm sm:p-8">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-[#10233f]"
          href={peopleBasePath}
        >
          <ChevronLeft className="h-4 w-4" />
          Back to People
        </Link>
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-[#10233f] sm:text-3xl">Face search</h2>
          <p className="mt-2 text-sm text-slate-500">
            Scan your face with the camera or upload a photo to find matching people in this event&apos;s
            library.
          </p>
        </div>
        <FaceSearchClient includeAdminCode personBasePath={peopleBasePath} searchUrl={searchUrl} />
      </div>
    </AdminEventWorkspaceShell>
  )
}
