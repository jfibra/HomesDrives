import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Camera } from 'lucide-react'

import AdminEventWorkspaceShell from '@/components/portals/AdminEventWorkspaceShell'
import { getAdminEventPhotographerPath } from '@/lib/portals/constants'
import { listEventPhotographers } from '@/lib/portals/event-photographers'
import { requirePortalEventBySlug } from '@/lib/portals/events'

type AdminEventPhotographersPageProps = {
  params: Promise<{ eventSlug: string }>
}

function formatLastSeen(value: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default async function AdminEventPhotographersPage({ params }: AdminEventPhotographersPageProps) {
  const { eventSlug } = await params

  let event
  try {
    event = await requirePortalEventBySlug(eventSlug)
  } catch {
    notFound()
  }

  let photographers: Awaited<ReturnType<typeof listEventPhotographers>> = []
  let loadError = ''

  try {
    photographers = await listEventPhotographers(event.id)
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load photographers.'
  }

  return (
    <AdminEventWorkspaceShell activeTab="photographers" event={event}>
      <div className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/75 p-5 shadow-[0_20px_60px_-12px_rgba(16,35,63,0.12)] backdrop-blur-sm sm:p-8">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Event team</p>
          <h2 className="mt-2 text-2xl font-semibold text-[#10233f] sm:text-3xl">Photographers</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Each photographer enters their full name when opening the event upload link. Click a name
            to browse their folders and view photos by sub-folder.
          </p>
        </div>

        {loadError ? (
          <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
            <p className="mt-2 text-xs text-red-600/80">
              Run <code className="rounded bg-red-100 px-1">database/portal-event-photographers.sql</code>{' '}
              in Supabase if this is a new setup.
            </p>
          </div>
        ) : null}

        {photographers.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center text-slate-500">
            <Camera className="mb-3 h-8 w-8 opacity-40" />
            <p className="text-sm font-medium text-slate-600">No photographers yet</p>
            <p className="mt-1 max-w-sm text-sm">
              Photographers appear here after they open the upload link and enter their name.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-100">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 sm:px-6">Name</th>
                  <th className="px-4 py-3 sm:px-6">Photos</th>
                  <th className="hidden px-4 py-3 sm:table-cell sm:px-6">Last active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {photographers.map((photographer) => (
                  <tr className="transition hover:bg-slate-50/80" key={photographer.id}>
                    <td className="px-4 py-4 sm:px-6">
                      <Link
                        className="font-semibold text-[#10233f] hover:underline"
                        href={getAdminEventPhotographerPath(event.slug, photographer.id)}
                      >
                        {photographer.full_name}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-slate-600 sm:px-6">{photographer.photo_count}</td>
                    <td className="hidden px-4 py-4 text-slate-500 sm:table-cell sm:px-6">
                      {formatLastSeen(photographer.last_seen_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminEventWorkspaceShell>
  )
}
