'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ImageIcon, Search, Users, X } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PORTAL_API_BASE } from '@/lib/portals/constants'
import type {
  GlobalSearchPersonHit,
  GlobalSearchPhotoHit,
} from '@/lib/portals/global-people-search'
import type { PersonPhoto } from '@/lib/types/people'

type AdminGlobalPeopleSearchProps = {
  adminCode: string
}

type PersonPreview = {
  person: GlobalSearchPersonHit
  eventId: string
  eventName: string
}

export default function AdminGlobalPeopleSearch({ adminCode }: AdminGlobalPeopleSearchProps) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [people, setPeople] = useState<GlobalSearchPersonHit[]>([])
  const [photos, setPhotos] = useState<GlobalSearchPhotoHit[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState('')

  const [selectedPerson, setSelectedPerson] = useState<PersonPreview | null>(null)
  const [personPhotos, setPersonPhotos] = useState<PersonPhoto[]>([])
  const [personPhotosPage, setPersonPhotosPage] = useState(1)
  const [personPhotosTotalPages, setPersonPhotosTotalPages] = useState(1)
  const [personPhotosTotalCount, setPersonPhotosTotalCount] = useState(0)
  const [isLoadingPersonPhotos, setIsLoadingPersonPhotos] = useState(false)
  const [isLoadingMorePersonPhotos, setIsLoadingMorePersonPhotos] = useState(false)
  const [personPhotosError, setPersonPhotosError] = useState('')
  const [lightboxPhoto, setLightboxPhoto] = useState<{
    imageUrl: string
    fileName: string
    eventName?: string
  } | null>(null)

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

  const loadPersonPhotos = useCallback(
    async (preview: PersonPreview, page: number, append: boolean) => {
      if (append) setIsLoadingMorePersonPhotos(true)
      else setIsLoadingPersonPhotos(true)
      setPersonPhotosError('')

      try {
        const response = await fetch(
          `${PORTAL_API_BASE}/admin/people-search/person-photos?adminCode=${encodeURIComponent(adminCode)}&personId=${encodeURIComponent(preview.person.personId)}&eventId=${encodeURIComponent(preview.eventId)}&page=${page}`,
        )
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(data?.error || 'Unable to load photos.')
        }

        const nextPhotos = Array.isArray(data?.photos) ? (data.photos as PersonPhoto[]) : []
        setPersonPhotos((current) => (append ? [...current, ...nextPhotos] : nextPhotos))
        setPersonPhotosPage(typeof data?.page === 'number' ? data.page : page)
        setPersonPhotosTotalPages(typeof data?.totalPages === 'number' ? data.totalPages : 1)
        setPersonPhotosTotalCount(typeof data?.totalCount === 'number' ? data.totalCount : nextPhotos.length)
      } catch (loadError) {
        if (!append) setPersonPhotos([])
        setPersonPhotosError(loadError instanceof Error ? loadError.message : 'Unable to load photos.')
      } finally {
        setIsLoadingPersonPhotos(false)
        setIsLoadingMorePersonPhotos(false)
      }
    },
    [adminCode],
  )

  function openPerson(person: GlobalSearchPersonHit) {
    const event = person.events[0]
    if (!event) return
    const preview = { person, eventId: event.id, eventName: event.name }
    setSelectedPerson(preview)
    setPersonPhotos([])
    setPersonPhotosPage(1)
    setPersonPhotosTotalPages(1)
    setPersonPhotosTotalCount(0)
    setLightboxPhoto(null)
    void loadPersonPhotos(preview, 1, false)
  }

  function closePersonModal() {
    setSelectedPerson(null)
    setPersonPhotos([])
    setPersonPhotosError('')
    setLightboxPhoto(null)
  }

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
            Look across all events by person name or photo file name. Open results here without leaving search.
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
                <button
                  key={`${person.personId}-${event?.id ?? 'none'}`}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-[#10233f]/30 hover:bg-slate-50"
                  onClick={() => openPerson(person)}
                  type="button"
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
                </button>
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
              <button
                key={photo.photoId}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:border-[#10233f]/30 hover:shadow-sm"
                onClick={() =>
                  setLightboxPhoto({
                    imageUrl: photo.imageUrl,
                    fileName: photo.fileName,
                    eventName: photo.event.name,
                  })
                }
                title={photo.fileName}
                type="button"
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
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <Dialog
        onOpenChange={(open) => {
          if (!open) closePersonModal()
        }}
        open={Boolean(selectedPerson)}
      >
        <DialogContent
          className="flex max-h-[90vh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 p-0 sm:max-w-4xl"
          showCloseButton={false}
        >
          <DialogHeader className="shrink-0 space-y-0 border-b border-slate-100 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-3">
              <button
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={closePersonModal}
                type="button"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-base text-[#10233f] sm:text-lg">
                  {selectedPerson?.person.name ?? 'Person'}
                </DialogTitle>
                <DialogDescription className="mt-0.5 truncate text-xs text-slate-500 sm:text-sm">
                  {selectedPerson
                    ? `${personPhotosTotalCount || selectedPerson.person.photoCount} photo${
                        (personPhotosTotalCount || selectedPerson.person.photoCount) === 1 ? '' : 's'
                      } · ${selectedPerson.eventName}`
                    : 'Person photos'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
            {isLoadingPersonPhotos ? (
              <p className="text-sm text-slate-500">Loading photos…</p>
            ) : personPhotosError ? (
              <p className="text-sm text-red-600">{personPhotosError}</p>
            ) : personPhotos.length === 0 ? (
              <p className="text-sm text-slate-500">No photos found for this person in this event.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
                  {personPhotos.map((photo) => (
                    <button
                      key={photo.id}
                      className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left transition hover:border-[#10233f]/30 hover:shadow-sm"
                      onClick={() =>
                        setLightboxPhoto({
                          imageUrl: photo.image_url,
                          fileName: photo.original_file_name,
                          eventName: selectedPerson?.eventName,
                        })
                      }
                      type="button"
                    >
                      <div className="aspect-square bg-slate-100">
                        {photo.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            alt={photo.original_file_name}
                            className="h-full w-full object-cover"
                            src={photo.image_url}
                          />
                        ) : null}
                      </div>
                      <p className="truncate px-2 py-1.5 text-[11px] font-medium text-slate-600">
                        {photo.original_file_name}
                      </p>
                    </button>
                  ))}
                </div>

                {personPhotosPage < personPhotosTotalPages && selectedPerson ? (
                  <div className="mt-4 flex justify-center">
                    <button
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                      disabled={isLoadingMorePersonPhotos}
                      onClick={() => void loadPersonPhotos(selectedPerson, personPhotosPage + 1, true)}
                      type="button"
                    >
                      {isLoadingMorePersonPhotos ? 'Loading…' : 'Load more photos'}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) setLightboxPhoto(null)
        }}
        open={Boolean(lightboxPhoto)}
      >
        <DialogContent
          className="flex max-h-[92vh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 bg-[#0b1524] p-0 text-white sm:max-w-5xl"
          showCloseButton={false}
        >
          <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
            <button
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              onClick={() => setLightboxPhoto(null)}
              type="button"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-sm font-semibold text-white sm:text-base">
                {lightboxPhoto?.fileName ?? 'Photo'}
              </DialogTitle>
              {lightboxPhoto?.eventName ? (
                <DialogDescription className="mt-0.5 truncate text-xs text-white/60">
                  {lightboxPhoto.eventName}
                </DialogDescription>
              ) : (
                <DialogDescription className="sr-only">Photo preview</DialogDescription>
              )}
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center bg-black/40 p-3 sm:p-6">
            {lightboxPhoto?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={lightboxPhoto.fileName}
                className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain"
                src={lightboxPhoto.imageUrl}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
