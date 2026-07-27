import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import AdminEventWorkspaceShell from '@/components/portals/AdminEventWorkspaceShell'
import EventAllPhotosGrid from '@/components/portals/EventAllPhotosGrid'
import EventPhotosSearchBar from '@/components/portals/EventPhotosSearchBar'
import PeoplePagination from '@/components/people/PeoplePagination'
import { getAdminEventPhotosPath } from '@/lib/portals/constants'
import { countEventPhotos, listEventPhotos } from '@/lib/portals/event-photos'
import { requirePortalEventBySlug } from '@/lib/portals/events'

const PAGE_SIZE = 24

type AdminEventPhotosPageProps = {
  params: Promise<{ eventSlug: string }>
  searchParams: Promise<{ page?: string; q?: string }>
}

function readPage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value)
}

export default async function AdminEventPhotosPage({ params, searchParams }: AdminEventPhotosPageProps) {
  const { eventSlug } = await params
  const query = await searchParams
  const page = readPage(query.page)
  const searchQuery = query.q?.trim() ?? ''

  let event
  try {
    event = await requirePortalEventBySlug(eventSlug)
  } catch {
    notFound()
  }

  let photosResult
  let totalPhotoCount = 0
  let loadError = ''

  try {
    ;[photosResult, totalPhotoCount] = await Promise.all([
      listEventPhotos({
        eventId: event.id,
        page,
        pageSize: PAGE_SIZE,
        search: searchQuery || undefined,
      }),
      countEventPhotos({ eventId: event.id }),
    ])
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load photos.'
    photosResult = { items: [], page: 1, pageSize: PAGE_SIZE, totalCount: 0, totalPages: 1 }
  }

  const safePage = Math.min(page, photosResult.totalPages)
  const photosBasePath = getAdminEventPhotosPath(event.slug)
  const showingCount = photosResult.totalCount
  const countLabel = searchQuery
    ? `${formatCount(showingCount)} matching photo${showingCount === 1 ? '' : 's'}`
    : `${formatCount(totalPhotoCount)} file${totalPhotoCount === 1 ? '' : 's'}`

  return (
    <AdminEventWorkspaceShell activeTab="photos" event={event} fileCount={totalPhotoCount}>
      <div className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/75 p-5 shadow-[0_20px_60px_-12px_rgba(16,35,63,0.12)] backdrop-blur-sm sm:p-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Library</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#10233f] sm:text-3xl">All files</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Browse every file uploaded to this event (images and videos). Face scanning uses images
              only — see the People tab for scan progress.
            </p>
          </div>
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#10233f] shadow-sm">
            {countLabel}
          </p>
        </div>

        <div className="mb-6">
          <Suspense fallback={null}>
            <EventPhotosSearchBar defaultValue={searchQuery} />
          </Suspense>
        </div>

        {loadError ? (
          <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        ) : null}

        <EventAllPhotosGrid photos={photosResult.items} />
        <PeoplePagination
          basePath={photosBasePath}
          page={safePage}
          searchQuery={searchQuery}
          totalPages={photosResult.totalPages}
        />
      </div>
    </AdminEventWorkspaceShell>
  )
}
