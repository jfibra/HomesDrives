'use client'

import { useState } from 'react'
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
            </div>
          )}
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
          <p className="mt-2 text-sm text-slate-500">
            {person.photo_count} photo{person.photo_count === 1 ? '' : 's'}
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
