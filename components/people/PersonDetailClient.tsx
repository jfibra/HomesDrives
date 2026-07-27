'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ImageIcon, Pencil } from 'lucide-react'

import PersonCoverPicker from '@/components/people/PersonCoverPicker'
import PersonGallery from '@/components/people/PersonGallery'
import PeoplePagination from '@/components/people/PeoplePagination'
import type { PaginatedResult, Person, PersonPhoto } from '@/lib/types/people'

type PersonDetailClientProps = {
  backHref?: string
  enableBulkRename?: boolean
  eventId?: string
  initialPerson: Person
  listReturn?: { page: number; q: string }
  paginationBasePath?: string
  /** Clean people library path (no query) for linking to other people. */
  peopleBasePath?: string
  photosResult: PaginatedResult<PersonPhoto>
}

export default function PersonDetailClient({
  backHref = '/people',
  enableBulkRename = false,
  eventId,
  initialPerson,
  listReturn,
  paginationBasePath,
  peopleBasePath,
  photosResult,
}: PersonDetailClientProps) {
  const router = useRouter()
  const [person, setPerson] = useState(initialPerson)
  const [nameDraft, setNameDraft] = useState(person.name)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [coverPickerOpen, setCoverPickerOpen] = useState(false)
  const [isFindingMore, setIsFindingMore] = useState(false)
  const [isFindingAll, setIsFindingAll] = useState(false)
  const [findMoreMessage, setFindMoreMessage] = useState('')
  const [findMoreOffset, setFindMoreOffset] = useState(0)
  const findAllAbortRef = useRef(false)

  const displayedPhotoCount = eventId ? photosResult.totalCount : person.photo_count

  useEffect(() => {
    setFindMoreOffset(0)
    setFindMoreMessage('')
    findAllAbortRef.current = true
    setIsFindingAll(false)
    setIsFindingMore(false)
  }, [eventId, person.id])

  useEffect(() => {
    return () => {
      findAllAbortRef.current = true
    }
  }, [])

  async function saveName() {
    const trimmed = nameDraft.trim()
    if (!trimmed) return

    setIsSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/people/${person.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to save name.')
      }
      if (data?.person) {
        setPerson(data.person)
        setNameDraft(data.person.name)
      }
      setIsEditing(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save name.')
    } finally {
      setIsSaving(false)
    }
  }

  async function detachPhotos(photoIds: string[]) {
    const response = await fetch(`/api/people/${person.id}/photos/detach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoIds }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(data?.error || 'Unable to remove photos from this person.')
    }
    if (data?.person) {
      setPerson(data.person)
    }
    router.refresh()
  }

  type FindMoreBatch = {
    linkedPhotos: number
    scannedPhotos: number
    remainingPhotos: number
    candidatePhotos: number
    nextScanOffset: number
    warning: string
  }

  async function runFindMoreBatch(scanOffset: number): Promise<FindMoreBatch> {
    const response = await fetch(`/api/people/${person.id}/photos/find-more`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, scanOffset }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(data?.error || 'Unable to find more photos.')
    }
    if (data?.person) {
      setPerson(data.person)
    }

    return {
      linkedPhotos: typeof data?.linkedPhotos === 'number' ? data.linkedPhotos : 0,
      scannedPhotos: typeof data?.scannedPhotos === 'number' ? data.scannedPhotos : 0,
      remainingPhotos: typeof data?.remainingPhotos === 'number' ? data.remainingPhotos : 0,
      candidatePhotos: typeof data?.candidatePhotos === 'number' ? data.candidatePhotos : 0,
      nextScanOffset:
        typeof data?.nextScanOffset === 'number' ? Math.max(0, data.nextScanOffset) : 0,
      warning: typeof data?.warning === 'string' ? data.warning.trim() : '',
    }
  }

  async function findMorePhotos() {
    if (!eventId || isFindingAll) return

    setIsFindingMore(true)
    setFindMoreMessage('')
    setError('')
    try {
      const batch = await runFindMoreBatch(findMoreOffset)
      setFindMoreOffset(batch.nextScanOffset)

      if (batch.warning) setError(batch.warning)

      if (batch.linkedPhotos > 0) {
        setFindMoreMessage(
          `Linked ${batch.linkedPhotos} more photo${batch.linkedPhotos === 1 ? '' : 's'} with this face (scanned ${batch.scannedPhotos} image${batch.scannedPhotos === 1 ? '' : 's'}).`,
        )
      } else if (batch.scannedPhotos > 0 && batch.remainingPhotos > 0) {
        setFindMoreMessage(
          `Scanned ${batch.scannedPhotos} more image${batch.scannedPhotos === 1 ? '' : 's'} — no new matches in this batch. ${batch.remainingPhotos} unlinked image${batch.remainingPhotos === 1 ? '' : 's'} left; click again or use Find all.`,
        )
      } else if (batch.candidatePhotos > 0 && batch.scannedPhotos === 0) {
        setFindMoreMessage(
          `Found ${batch.candidatePhotos} unlinked image${batch.candidatePhotos === 1 ? '' : 's'} to search. Click Find all to scan them automatically.`,
        )
      } else {
        setFindMoreMessage('No more unlinked images to search for this person in this event.')
      }
      router.refresh()
    } catch (findError) {
      setError(findError instanceof Error ? findError.message : 'Unable to find more photos.')
    } finally {
      setIsFindingMore(false)
    }
  }

  async function findAllMatchingPhotos() {
    if (!eventId || isFindingMore || isFindingAll) return

    findAllAbortRef.current = false
    setIsFindingAll(true)
    setFindMoreMessage('')
    setError('')

    let offset = findMoreOffset
    let totalLinked = 0
    let totalScanned = 0
    let batches = 0

    try {
      while (!findAllAbortRef.current) {
        setFindMoreMessage(
          `Bulk searching… batch ${batches + 1}${totalLinked > 0 ? ` · ${totalLinked} linked so far` : ''}${totalScanned > 0 ? ` · ${totalScanned} images checked` : ''}. Keep this page open.`,
        )

        const batch = await runFindMoreBatch(offset)
        batches += 1
        totalLinked += batch.linkedPhotos
        totalScanned += batch.scannedPhotos
        offset = batch.nextScanOffset
        setFindMoreOffset(offset)

        if (batch.warning) {
          setError(batch.warning)
          break
        }

        if (batch.remainingPhotos <= 0 || batch.scannedPhotos === 0) {
          break
        }
      }

      if (findAllAbortRef.current) {
        setFindMoreMessage(
          `Stopped early. Linked ${totalLinked} photo${totalLinked === 1 ? '' : 's'} across ${totalScanned} image${totalScanned === 1 ? '' : 's'}. Click Find all to continue.`,
        )
      } else if (totalLinked > 0) {
        setFindMoreMessage(
          `Done. Linked ${totalLinked} more photo${totalLinked === 1 ? '' : 's'} for this person (checked ${totalScanned} image${totalScanned === 1 ? '' : 's'}).`,
        )
      } else {
        setFindMoreMessage(
          `Done. Checked ${totalScanned} image${totalScanned === 1 ? '' : 's'} — no additional matches for this person.`,
        )
      }
      router.refresh()
    } catch (findError) {
      setError(findError instanceof Error ? findError.message : 'Unable to find more photos.')
    } finally {
      setIsFindingAll(false)
    }
  }

  function stopFindAll() {
    findAllAbortRef.current = true
  }

  async function removePhotos(photoIds: string[]) {
    const response = await fetch(`/api/people/${person.id}/photos/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoIds }),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(data?.error || 'Unable to remove false detections.')
    }
    if (data?.person) {
      setPerson(data.person)
    }
    router.refresh()
  }

  return (
    <div>
      <Link
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-[#10233f]"
        href={backHref}
      >
        <ChevronLeft className="h-4 w-4" />
        All people
      </Link>

      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-slate-100 shadow-sm">
          {person.cover_face_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={person.name} className="h-full w-full object-cover" src={person.cover_face_url} />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-lg font-semibold outline-none focus:border-[#10233f] focus:ring-2 focus:ring-[#10233f]/10"
                onChange={(e) => setNameDraft(e.target.value)}
                value={nameDraft}
              />
              <div className="flex gap-2">
                <button
                  className="rounded-xl bg-[#10233f] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={isSaving || !nameDraft.trim()}
                  onClick={() => void saveName()}
                  type="button"
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600"
                  disabled={isSaving}
                  onClick={() => {
                    setIsEditing(false)
                    setNameDraft(person.name)
                    setError('')
                  }}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-[#10233f] sm:text-3xl">{person.name}</h1>
              <button
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                onClick={() => setIsEditing(true)}
                type="button"
              >
                <Pencil className="h-3.5 w-3.5" />
                Rename
              </button>
              <button
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                onClick={() => setCoverPickerOpen(true)}
                type="button"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Change preview
              </button>
              {eventId ? (
                <>
                  <button
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                    disabled={isFindingMore || isFindingAll}
                    onClick={() => void findMorePhotos()}
                    type="button"
                  >
                    {isFindingMore ? 'Searching…' : 'Find more photos'}
                  </button>
                  {isFindingAll ? (
                    <button
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
                      onClick={stopFindAll}
                      type="button"
                    >
                      Stop search
                    </button>
                  ) : (
                    <button
                      className="inline-flex items-center gap-1 rounded-lg border border-[#10233f]/20 bg-[#10233f] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#1a3559] disabled:opacity-60"
                      disabled={isFindingMore}
                      onClick={() => void findAllMatchingPhotos()}
                      title="Automatically scan all remaining event photos for this face. Keep this page open."
                      type="button"
                    >
                      Find all matching photos
                    </button>
                  )}
                </>
              ) : null}
            </div>
          )}
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
          {findMoreMessage ? <p className="mt-2 text-sm text-emerald-700">{findMoreMessage}</p> : null}
          <p className="mt-2 text-sm text-slate-500">
            {displayedPhotoCount} photo{displayedPhotoCount === 1 ? '' : 's'} with this face
            {person.cover_locked ? ' · Custom preview' : ''}
          </p>
        </div>
      </div>

      <PersonCoverPicker
        onOpenChange={setCoverPickerOpen}
        onUpdated={(updated) => {
          setPerson(updated)
          router.refresh()
        }}
        open={coverPickerOpen}
        person={person}
      />

      <PersonGallery
        defaultRenameBase={person.name}
        enableBulkRename={enableBulkRename}
        eventId={eventId}
        onDetachPhotos={detachPhotos}
        onRemovePhotos={removePhotos}
        peopleBasePath={peopleBasePath ?? backHref.split('?')[0]}
        personId={person.id}
        photos={photosResult.items}
      />
      <PeoplePagination
        basePath={paginationBasePath ?? `/people/${person.id}`}
        page={photosResult.page}
        preserveParams={{
          fromPage: listReturn && listReturn.page > 1 ? String(listReturn.page) : undefined,
          fromQ: listReturn?.q || undefined,
        }}
        totalPages={photosResult.totalPages}
      />
    </div>
  )
}
