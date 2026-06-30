import { notFound } from 'next/navigation'

import AdminEventWorkspaceShell from '@/components/portals/AdminEventWorkspaceShell'
import PersonDetailClient from '@/components/people/PersonDetailClient'
import { getAdminEventPeoplePath, getAdminEventPersonPath } from '@/lib/portals/constants'
import { requirePortalEventBySlug } from '@/lib/portals/events'
import { getPersonById, getPersonPhotosForEvent } from '@/lib/people'

const PAGE_SIZE = 24

type AdminEventPersonPageProps = {
  params: Promise<{ eventSlug: string; personId: string }>
  searchParams: Promise<{ page?: string }>
}

function readPage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export default async function AdminEventPersonPage({ params, searchParams }: AdminEventPersonPageProps) {
  const { eventSlug, personId } = await params
  const query = await searchParams
  const page = readPage(query.page)

  let event
  try {
    event = await requirePortalEventBySlug(eventSlug)
  } catch {
    notFound()
  }

  const person = await getPersonById(personId).catch(() => null)
  if (!person) notFound()

  const photosResult = await getPersonPhotosForEvent({
    personId,
    eventId: event.id,
    page,
    pageSize: PAGE_SIZE,
  }).catch(() => ({
    items: [],
    page: 1,
    pageSize: PAGE_SIZE,
    totalCount: 0,
    totalPages: 1,
  }))

  if (photosResult.totalCount === 0 && page > 1) {
    notFound()
  }

  const peopleBasePath = getAdminEventPeoplePath(event.slug)
  const personBasePath = getAdminEventPersonPath(event.slug, personId)

  return (
    <AdminEventWorkspaceShell activeTab="people" event={event}>
      <div className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/75 p-5 shadow-[0_20px_60px_-12px_rgba(16,35,63,0.12)] backdrop-blur-sm sm:p-8">
        <PersonDetailClient
          backHref={peopleBasePath}
          initialPerson={person}
          paginationBasePath={personBasePath}
          photosResult={photosResult}
        />
      </div>
    </AdminEventWorkspaceShell>
  )
}
