'use client'

import { useEffect, useState } from 'react'
import { Check, ImageIcon, Loader2, Sparkles, X } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Person } from '@/lib/types/people'

type CoverFaceOption = {
  face_id: string
  face_thumbnail_url: string
  confidence: number | null
}

type PersonCoverPickerProps = {
  onUpdated?: (person: Person) => void
  open: boolean
  person: Person
  onOpenChange: (open: boolean) => void
}

export default function PersonCoverPicker({
  onOpenChange,
  onUpdated,
  open,
  person,
}: PersonCoverPickerProps) {
  const [faces, setFaces] = useState<CoverFaceOption[]>([])
  const [selectedUrl, setSelectedUrl] = useState(person.cover_face_url)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setIsLoading(true)
    setError('')
    setSelectedUrl(person.cover_face_url)

    void fetch(`/api/people/${person.id}/cover`)
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(data?.error || 'Unable to load face previews.')
        }
        if (cancelled) return
        const nextFaces: CoverFaceOption[] = Array.isArray(data?.faces) ? data.faces : []
        setFaces(nextFaces)
        // Only keep current cover in the list when it still belongs to an active face.
        const coverUrl =
          typeof data?.person?.cover_face_url === 'string' ? data.person.cover_face_url.trim() : ''
        if (
          coverUrl &&
          nextFaces.some((face) => face.face_thumbnail_url === coverUrl) === false &&
          nextFaces.length > 0
        ) {
          // Stale cover URL (e.g. after "No face here") — select the clearest remaining face.
          setSelectedUrl(nextFaces[0]?.face_thumbnail_url ?? null)
        } else {
          setSelectedUrl(coverUrl || person.cover_face_url)
        }
      })
      .catch((loadError: unknown) => {
        if (cancelled) return
        setError(loadError instanceof Error ? loadError.message : 'Unable to load face previews.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, person.cover_face_url, person.id])

  async function saveManual() {
    if (!selectedUrl) return
    setIsSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/people/${person.id}/cover`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faceThumbnailUrl: selectedUrl, locked: true }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to save preview.')
      }
      if (data?.person) onUpdated?.(data.person)
      onOpenChange(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save preview.')
    } finally {
      setIsSaving(false)
    }
  }

  async function useAutoBest() {
    setIsSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/people/${person.id}/cover`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto: true, locked: false }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to use auto preview.')
      }
      if (data?.person) onUpdated?.(data.person)
      onOpenChange(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to use auto preview.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose preview face</DialogTitle>
          <DialogDescription>
            Pick which face shows for <span className="font-medium text-slate-700">{person.name}</span> in
            the People grid. Showing the clearest face crops.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex min-h-40 items-center justify-center text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : faces.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No face crops found for this person yet.
          </p>
        ) : (
          <div className="max-h-[min(50vh,28rem)] overflow-y-auto p-0.5">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {faces.map((face) => {
                const selected = selectedUrl === face.face_thumbnail_url
                return (
                  <button
                    className={`overflow-hidden rounded-xl border bg-slate-100 p-0 transition ${
                      selected
                        ? 'border-[#10233f] ring-2 ring-[#10233f]/20'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                    key={face.face_id}
                    onClick={() => setSelectedUrl(face.face_thumbnail_url)}
                    type="button"
                  >
                    <span className="relative block w-full" style={{ paddingBottom: '100%' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                        src={face.face_thumbnail_url}
                      />
                      {selected ? (
                        <span className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#10233f] text-white shadow">
                          <Check className="h-3 w-3" />
                        </span>
                      ) : null}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <button
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            disabled={isSaving || isLoading}
            onClick={() => void useAutoBest()}
            type="button"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Use clearest auto
          </button>
          <div className="flex gap-2">
            <button
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
              type="button"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
            <button
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#10233f] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={isSaving || isLoading || !selectedUrl}
              onClick={() => void saveManual()}
              type="button"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
              Use selected
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
