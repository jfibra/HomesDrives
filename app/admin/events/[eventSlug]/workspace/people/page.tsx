import Link from 'next/link'
import { notFound } from 'next/navigation'

import AdminEventWorkspaceShell from '@/components/portals/AdminEventWorkspaceShell'
import PeopleGridManager from '@/components/people/PeopleGridManager'
import PeopleLibrarySearchBar from '@/components/people/PeopleLibrarySearchBar'
import PeoplePagination from '@/components/people/PeoplePagination'
import { getAdminEventPeoplePath, getAdminEventPeopleSearchPath } from '@/lib/portals/constants'
import { requirePortalEventBySlug } from '@/lib/portals/events'
import { listPeopleForEvent } from '@/lib/people'

const PAGE_SIZE = 24

type AdminEventPeoplePageProps = {
  params: Promise<{ eventSlug: string }>
  searchParams: Promise<{ page?: string; q?: string }>
}

function readPage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export default async function AdminEventPeoplePage({ params, searchParams }: AdminEventPeoplePageProps) {
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

  let peopleResult
  let loadError = ''

  try {
    peopleResult = await listPeopleForEvent({
      eventId: event.id,
      page,
      pageSize: PAGE_SIZE,
      search: searchQuery || undefined,
    })
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load people.'
    peopleResult = { items: [], page: 1, pageSize: PAGE_SIZE, totalCount: 0, totalPages: 1 }
  }

  const safePage = Math.min(page, peopleResult.totalPages)
  const peopleBasePath = getAdminEventPeoplePath(event.slug)

  return (
    <AdminEventWorkspaceShell activeTab="people" event={event}>
      <div className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/75 p-5 shadow-[0_20px_60px_-12px_rgba(16,35,63,0.12)] backdrop-blur-sm sm:p-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Library</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#10233f] sm:text-3xl">People</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Automatically grouped faces from your photo library. New photos are scanned in the
              background while this event workspace is open. Use{' '}
              <span className="font-medium text-slate-600">Select people to remove</span> for blurry or
              false detections.
            </p>
          </div>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#10233f] shadow-sm transition hover:bg-slate-50"
            href={getAdminEventPeopleSearchPath(event.slug)}
          >
            Face search
          </Link>
        </div>

        <div className="mb-6">
          <PeopleLibrarySearchBar defaultValue={searchQuery} />
        </div>

        {loadError ? (
          <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
            <p className="mt-2 text-xs text-red-600/80">
              Re-run the event-scoped functions in{' '}
              <code className="rounded bg-red-100 px-1">database/people-faces.sql</code> in Supabase if
              this is a new setup.
            </p>
          </div>
        ) : null}

        <PeopleGridManager
          emptyAction={
            <p className="max-w-md text-center text-sm text-slate-500">
              {searchQuery
                ? 'No people match your search. Try a different name or clear the search.'
                : 'Face scanning runs automatically in the background. People will appear here as photos are processed. Keep the face recognition service running.'}
            </p>
          }
          enableBulkDelete
          people={peopleResult.items}
          personBasePath={peopleBasePath}
        />
        <PeoplePagination
          basePath={peopleBasePath}
          page={safePage}
          searchQuery={searchQuery}
          totalPages={peopleResult.totalPages}
        />
      </div>
    </AdminEventWorkspaceShell>
  )
}
