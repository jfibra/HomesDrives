'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CheckSquare, Pencil, Square, Trash2, UserX, X } from 'lucide-react'

import PhotoFaceOverlay from '@/components/people/PhotoFaceOverlay'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PORTAL_ADMIN_SESSION_KEY } from '@/lib/portals/constants'
import { buildBulkPortalRenamePlan } from '@/lib/portals/bulk-rename-photos'
import type { PersonPhoto } from '@/lib/types/people'

type PersonGalleryProps = {
  defaultRenameBase?: string
  enableBulkRename?: boolean
  eventId?: string
  onDetachPhotos?: (photoIds: string[]) => Promise<void>
  onRemovePhotos?: (photoIds: string[]) => Promise<void>
  peopleBasePath?: string
  personId?: string
  photos: PersonPhoto[]
}

export default function PersonGallery({
  defaultRenameBase = '',
  enableBulkRename = false,
  eventId,
  onDetachPhotos,
  onRemovePhotos,
  peopleBasePath,
  personId,
  photos,
}: PersonGalleryProps) {
  const router = useRouter()
  const [activePhoto, setActivePhoto] = useState<PersonPhoto | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState('')
  const [bulkRenameOpen, setBulkRenameOpen] = useState(false)
  const [bulkRenameBase, setBulkRenameBase] = useState(defaultRenameBase)
  const [isBulkRenaming, setIsBulkRenaming] = useState(false)

  const selectedPhotos = useMemo(
    () => photos.filter((photo) => selectedIds.includes(photo.id)),
    [photos, selectedIds],
  )

  const bulkRenamePreview = useMemo(
    () => buildBulkPortalRenamePlan(bulkRenameBase, selectedPhotos),
    [bulkRenameBase, selectedPhotos],
  )
  const canBulkRename = enableBulkRename && Boolean(eventId && personId)

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const allSelected = photos.length > 0 && selectedIds.length === photos.length

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds([])
    setError('')
  }

  function openBulkRenameDialog() {
    setBulkRenameBase(defaultRenameBase)
    setBulkRenameOpen(true)
  }

  async function saveBulkRename() {
    if (!canBulkRename || bulkRenamePreview.length === 0) return

    const adminCode = window.localStorage.getItem(PORTAL_ADMIN_SESSION_KEY)?.trim() ?? ''
    if (!adminCode) {
      setError('Admin session expired. Sign in again from the admin portal.')
      return
    }

    setIsBulkRenaming(true)
    setError('')
    try {
      const response = await fetch(`/api/people/${personId}/photos/bulk-rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminCode,
          baseName: bulkRenameBase,
          eventId,
          photoIds: selectedIds,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to rename photos.')
      }

      setBulkRenameOpen(false)
      setBulkRenameBase(defaultRenameBase)
      exitSelectMode()
      router.refresh()
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'Unable to rename photos.')
    } finally {
      setIsBulkRenaming(false)
    }
  }

  function togglePhoto(photoId: string) {
    setSelectedIds((current) =>
      current.includes(photoId) ? current.filter((id) => id !== photoId) : [...current, photoId],
    )
  }

  function toggleSelectAll() {
    setSelectedIds(allSelected ? [] : photos.map((photo) => photo.id))
  }

  async function runAction(
    photoIds: string[],
    action?: (photoIds: string[]) => Promise<void>,
    fallbackMessage = 'Unable to update photos.',
  ) {
    if (!action || photoIds.length === 0) return

    setIsWorking(true)
    setError('')
    try {
      await action(photoIds)
      setActivePhoto(null)
      exitSelectMode()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : fallbackMessage)
    } finally {
      setIsWorking(false)
    }
  }

  if (photos.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-sm text-slate-500">
        No photos linked to this person yet.
      </div>
    )
  }

  return (
    <>
      {onDetachPhotos || onRemovePhotos || canBulkRename ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {selectMode ? (
            <>
              <p className="text-sm text-slate-600">
                {selectedIds.length} photo{selectedIds.length === 1 ? '' : 's'} selected
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  onClick={toggleSelectAll}
                  type="button"
                >
                  {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  {allSelected ? 'Deselect all' : 'Select all on page'}
                </button>
                {canBulkRename ? (
                  <button
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#10233f] shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isWorking || isBulkRenaming || selectedIds.length === 0}
                    onClick={openBulkRenameDialog}
                    type="button"
                  >
                    <Pencil className="h-4 w-4" />
                    Rename {selectedIds.length > 0 ? selectedIds.length : ''}
                  </button>
                ) : null}
                {onRemovePhotos ? (
                  <button
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isWorking || selectedIds.length === 0}
                    onClick={() => void runAction(selectedIds, onRemovePhotos, 'Unable to remove detections.')}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                    {isWorking
                      ? 'Removing…'
                      : `No face here${selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}`}
                  </button>
                ) : null}
                {onDetachPhotos ? (
                  <button
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#10233f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1a3358] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isWorking || selectedIds.length === 0}
                    onClick={() => void runAction(selectedIds, onDetachPhotos, 'Unable to remove photos.')}
                    type="button"
                  >
                    <UserX className="h-4 w-4" />
                    {isWorking
                      ? 'Removing…'
                      : `Not this person${selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}`}
                  </button>
                ) : null}
                <button
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  disabled={isWorking}
                  onClick={exitSelectMode}
                  type="button"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button
              className="inline-flex min-h-10 items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#10233f] shadow-sm transition hover:bg-slate-50"
              onClick={() => {
                setError('')
                setSelectMode(true)
              }}
              type="button"
            >
              <CheckSquare className="h-4 w-4" />
              Select photos
            </button>
          )}
        </div>
      ) : null}

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setBulkRenameOpen(false)
            setBulkRenameBase(defaultRenameBase)
          } else {
            setBulkRenameOpen(true)
          }
        }}
        open={bulkRenameOpen}
      >
        <DialogContent className="rounded-2xl border-slate-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#10233f]">
              Rename {selectedIds.length} selected file{selectedIds.length === 1 ? '' : 's'}
            </DialogTitle>
            <DialogDescription>
              Enter a base name. Each file keeps its extension and gets a number, for example{' '}
              {defaultRenameBase || 'name'}-1.jpg, {defaultRenameBase || 'name'}-2.jpg.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="person-bulk-rename-base">
                Base name
              </label>
              <input
                autoFocus
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#10233f] focus:ring-2 focus:ring-[#10233f]/10"
                id="person-bulk-rename-base"
                onChange={(event) => setBulkRenameBase(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && bulkRenamePreview.length > 0) {
                    void saveBulkRename()
                  }
                }}
                placeholder={defaultRenameBase || 'photo-name'}
                value={bulkRenameBase}
              />
            </div>
            {bulkRenamePreview.length > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-slate-700">
                  {bulkRenamePreview.slice(0, 8).map((rename) => (
                    <li className="truncate font-mono text-xs" key={rename.id}>
                      {rename.fileName}
                    </li>
                  ))}
                  {bulkRenamePreview.length > 8 ? (
                    <li className="text-xs text-slate-500">+{bulkRenamePreview.length - 8} more</li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 sm:flex-none"
              disabled={isBulkRenaming}
              onClick={() => {
                setBulkRenameOpen(false)
                setBulkRenameBase(defaultRenameBase)
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-[#10233f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1a3358] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
              disabled={isBulkRenaming || bulkRenamePreview.length === 0}
              onClick={() => void saveBulkRename()}
              type="button"
            >
              {isBulkRenaming
                ? 'Renaming…'
                : `Rename ${selectedIds.length} file${selectedIds.length === 1 ? '' : 's'}`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo) => {
          const isSelected = selectedSet.has(photo.id)

          return (
            <div
              className={`group overflow-hidden rounded-xl border bg-white text-left shadow-sm transition ${
                isSelected ? 'border-[#10233f] ring-2 ring-[#10233f]/15' : 'border-slate-200/80'
              }`}
              key={photo.id}
            >
              {selectMode ? (
                <div
                  className="block w-full cursor-pointer"
                  onClick={() => {
                    setError('')
                    togglePhoto(photo.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setError('')
                      togglePhoto(photo.id)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                    <div
                      className={`absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-md border shadow-sm ${
                        isSelected
                          ? 'border-[#10233f] bg-[#10233f] text-white'
                          : 'border-slate-300 bg-white/95 text-transparent'
                      }`}
                    >
                      <Check className="h-3 w-3" />
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={photo.original_file_name}
                      className="h-full w-full object-cover object-top transition duration-200 group-hover:scale-[1.02]"
                      src={photo.image_url}
                    />
                  </div>
                  <p className="truncate px-3 py-2 text-xs text-slate-600">{photo.original_file_name}</p>
                </div>
              ) : (
                <button
                  className="block w-full"
                  onClick={() => {
                    setError('')
                    setActivePhoto(photo)
                  }}
                  type="button"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={photo.original_file_name}
                      className="h-full w-full object-cover object-top transition duration-200 group-hover:scale-[1.02]"
                      src={photo.image_url}
                    />
                  </div>
                  <p className="truncate px-3 py-2 text-xs text-slate-600">{photo.original_file_name}</p>
                </button>
              )}
            </div>
          )
        })}
      </div>

      {activePhoto && !selectMode ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#10233f]/90 p-4 backdrop-blur-sm"
          onClick={() => setActivePhoto(null)}
        >
          <div className="max-w-5xl text-center" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 truncate text-sm font-medium text-white">{activePhoto.original_file_name}</p>
            <PhotoFaceOverlay
              getPersonHref={
                peopleBasePath
                  ? (id) => `${peopleBasePath.replace(/\/$/, '')}/${id}`
                  : undefined
              }
              highlightPersonId={personId}
              photo={activePhoto}
            />
            {onDetachPhotos || onRemovePhotos ? (
              <div className="mt-4 flex flex-col items-center gap-2">
                {onRemovePhotos ? (
                  <button
                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-red-200 bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/30 disabled:opacity-60"
                    disabled={isWorking}
                    onClick={() => void runAction([activePhoto.id], onRemovePhotos, 'Unable to remove detection.')}
                    type="button"
                  >
                    {isWorking ? 'Removing…' : 'No face here'}
                  </button>
                ) : null}
                {onDetachPhotos ? (
                  <button
                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-60"
                    disabled={isWorking}
                    onClick={() => void runAction([activePhoto.id], onDetachPhotos, 'Unable to remove photo.')}
                    type="button"
                  >
                    {isWorking ? 'Removing…' : 'Not this person'}
                  </button>
                ) : null}
                <p className="max-w-md text-xs text-white/70">
                  Use <span className="font-medium">No face here</span> for false detections. Use{' '}
                  <span className="font-medium">Not this person</span> when it is a real face assigned to the
                  wrong person.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
