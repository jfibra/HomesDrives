'use client'

import { useMemo, useState } from 'react'
import { Check, CheckSquare, Square, Trash2, UserX, X } from 'lucide-react'

import type { PersonPhoto } from '@/lib/types/people'

type PersonGalleryProps = {
  onDetachPhotos?: (photoIds: string[]) => Promise<void>
  onRemovePhotos?: (photoIds: string[]) => Promise<void>
  photos: PersonPhoto[]
}

export default function PersonGallery({ onDetachPhotos, onRemovePhotos, photos }: PersonGalleryProps) {
  const [activePhoto, setActivePhoto] = useState<PersonPhoto | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState('')

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const allSelected = photos.length > 0 && selectedIds.length === photos.length

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds([])
    setError('')
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
      {onDetachPhotos || onRemovePhotos ? (
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
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={activePhoto.original_file_name}
              className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
              src={activePhoto.image_url}
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
