'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ImageIcon, Search, Users, X } from 'lucide-react'

import { PORTAL_API_BASE } from '@/lib/portals/constants'
import type {
  GlobalSearchPersonHit,
  GlobalSearchPhotoHit,
} from '@/lib/portals/global-people-search'

type AdminGlobalPeopleSearchProps = {
  adminCode: string
}

export default function AdminGlobalPeopleSearch({ adminCode }: AdminGlobalPeopleSearchProps) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [people, setPeople] = useState<GlobalSearchPersonHit[]>([])
  const [photos, setPhotos] = useState<GlobalSearchPhotoHit[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!adminCode) return

    if (debouncedQuery.length < 2) {
      setPeople([])
      setPhotos([])
      setError('')
      setIsSearching(false)
      return
    }

    let cancelled = false

    async function runSearch() {
      setIsSearching(true)
      setError('')
      try {
        const response = await fetch(
          `${PORTAL_API_BASE}/admin/people-search?adminCode=${encodeURIComponent(adminCode)}&q=${encodeURIComponent(debouncedQuery)}`,
        )
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(data?.error || 'Unable to search.')
        }
        if (cancelled) return
        setPeople(Array.isArray(data?.people) ? data.people : [])
        setPhotos(Array.isArray(data?.photos) ? data.photos : [])
      } catch (searchError) {
        if (cancelled) return
        setPeople([])
        setPhotos([])
        setError(searchError instanceof Error ? searchError.message : 'Unable to search.')
      } finally {
        if (!cancelled) setIsSearching(false)
      }
    }

    void runSearch()
    return () => {
      cancelled = true
    }
  }, [adminCode, debouncedQuery])

  const hasQuery = debouncedQuery.length >= 2
  const totalHits = people.length + photos.length
  const emptyMessage = useMemo(() => {
    if (!hasQuery) return 'Search people by name, or photos by file name across every event.'
    if (isSearching) return 'Searching…'
    if (error) return error
    return 'No people or photos matched that search.'
  }, [error, hasQuery, isSearching])

  return (
    <section className="overflow-hidden rounded-2xl border border-white/80 bg-white/90 p-4 shadow-[0_20px_60px_-12px_rgba(16,35,63,0.12)] sm:rounded-[1.75rem] sm:p-6 md:p-8">
      <div className="mb-4 flex items-start gap-3 sm:mb-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#10233f] text-white sm:h-11 sm:w-11">
          <Search className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[#10233f] sm:text-lg">Search people & photos</h2>
          <p className="mt-1 text-sm text-slate-500">
            Look across all events by person name or photo file name. Each result shows which event it belongs to.
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-10 text-sm outline-none transition focus:border-[#10233f] focus:bg-white focus:ring-2 focus:ring-[#10233f]/10"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search person name or file name…"
          value={query}
        />
        {query ? (
          <button
            aria-label="Clear search"
            className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            onClick={() => setQuery('')}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {!hasQuery || (totalHits === 0 && !isSearching) ? (
        <p className={`mt-4 text-sm ${error ? 'text-red-600' : 'text-slate-500'}`}>{emptyMessage}</p>
      ) : null}

      {hasQuery && isSearching ? <p className="mt-4 text-sm text-slate-500">Searching…</p> : null}

      {people.length > 0 ? (
        <div className="mt-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            <Users className="h-3.5 w-3.5" />
            People ({people.length})
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {people.map((person) => {
              const event = person.events[0]
              return (
                <Link
                  key={`${person.personId}-${event?.id ?? 'none'}`}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-[#10233f]/30 hover:bg-slate-50"
                  href={person.href}
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                    {person.coverFaceUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={person.name}
                        className="h-full w-full object-cover"
                        src={person.coverFaceUrl}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-300">
                        <Users className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#10233f]">{person.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {person.photoCount} photo{person.photoCount === 1 ? '' : 's'}
                    </p>
                    {event ? (
                      <span className="mt-2 inline-flex max-w-full truncate rounded-full bg-[#10233f]/8 px-2.5 py-1 text-[11px] font-semibold text-[#10233f]">
                        {event.name}
                      </span>
                    ) : null}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      ) : null}

      {photos.length > 0 ? (
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            <ImageIcon className="h-3.5 w-3.5" />
            Photos ({photos.length})
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((photo) => (
              <Link
                key={photo.photoId}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-[#10233f]/30 hover:shadow-sm"
                href={photo.href}
                title={photo.fileName}
              >
                <div className="aspect-square bg-slate-100">
                  {photo.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={photo.fileName} className="h-full w-full object-cover" src={photo.imageUrl} />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-300">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 p-2.5">
                  <p className="truncate text-xs font-semibold text-[#10233f]">{photo.fileName}</p>
                  <span className="inline-flex max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {photo.event.name}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
