'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, type SyntheticEvent } from 'react'
import { Loader2, UserRound } from 'lucide-react'

import type { BoundingBox, PersonPhoto, PhotoFaceAnnotation } from '@/lib/types/people'

type PhotoFaceOverlayProps = {
  getPersonHref?: (personId: string) => string
  highlightPersonId?: string
  photo: PersonPhoto
}

function boxToPercent(box: BoundingBox, sourceWidth: number, sourceHeight: number) {
  const width = Math.max(1, sourceWidth)
  const height = Math.max(1, sourceHeight)

  return {
    left: `${(box.x / width) * 100}%`,
    top: `${(box.y / height) * 100}%`,
    width: `${(box.width / width) * 100}%`,
    height: `${(box.height / height) * 100}%`,
  }
}

function FaceMarker({
  face,
  focused,
  index,
  isCurrentPerson,
  style,
  onActivate,
  onDeactivate,
  onToggle,
}: {
  face: PhotoFaceAnnotation
  focused: boolean
  index: number
  isCurrentPerson: boolean
  style: { left: string; top: string; width: string; height: string }
  onActivate: () => void
  onDeactivate: () => void
  onToggle: () => void
}) {
  const cornerColor = focused
    ? 'border-emerald-400'
    : isCurrentPerson
      ? 'border-sky-300'
      : 'border-white/90'

  const pinClass = focused
    ? 'bg-emerald-400 text-[#10233f] ring-2 ring-emerald-300/80 scale-110'
    : isCurrentPerson
      ? 'bg-sky-400 text-[#10233f] ring-2 ring-sky-300/60'
      : 'bg-[#10233f]/85 text-white ring-1 ring-white/70'

  return (
    <div aria-hidden className="pointer-events-none absolute" style={style}>
      <span className={`absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 ${cornerColor}`} />
      <span className={`absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2 ${cornerColor}`} />
      <span className={`absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 ${cornerColor}`} />
      <span className={`absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 ${cornerColor}`} />

      <button
        aria-label={`${face.person_name}, face ${index + 1}`}
        className={`pointer-events-auto absolute left-1/2 top-0 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-bold shadow-md transition ${pinClass}`}
        onClick={onToggle}
        onMouseEnter={onActivate}
        onMouseLeave={onDeactivate}
        type="button"
      >
        {index + 1}
      </button>
    </div>
  )
}

function FaceNameChip({
  active,
  face,
  getPersonHref,
  highlight,
  index,
  isCurrentPerson,
  onActivate,
  onDeactivate,
}: {
  active: boolean
  face: PhotoFaceAnnotation
  getPersonHref?: (personId: string) => string
  highlight: boolean
  index: number
  isCurrentPerson: boolean
  onActivate: () => void
  onDeactivate: () => void
}) {
  const className = `inline-flex min-h-9 max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-left text-sm font-semibold transition ${
    active || highlight
      ? 'border-emerald-400 bg-emerald-500/20 text-white shadow-[0_0_0_2px_rgba(52,211,153,0.35)]'
      : isCurrentPerson
        ? 'border-sky-300/80 bg-sky-400/10 text-white hover:border-sky-200'
        : 'border-white/20 bg-white/10 text-white/90 hover:border-white/40 hover:bg-white/15'
  }`

  const content = (
    <>
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
          active || highlight ? 'bg-emerald-400 text-[#10233f]' : 'bg-white/20 text-white'
        }`}
      >
        {index + 1}
      </span>
      {face.face_thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="h-7 w-7 shrink-0 rounded-full object-cover"
          src={face.face_thumbnail_url}
        />
      ) : (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70">
          <UserRound className="h-4 w-4" />
        </span>
      )}
      <span className="truncate">{face.person_name}</span>
    </>
  )

  if (getPersonHref) {
    return (
      <Link
        className={className}
        href={getPersonHref(face.person_id)}
        onClick={onActivate}
        onMouseEnter={onActivate}
        onMouseLeave={onDeactivate}
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      className={className}
      onClick={onActivate}
      onMouseEnter={onActivate}
      onMouseLeave={onDeactivate}
      type="button"
    >
      {content}
    </button>
  )
}

export default function PhotoFaceOverlay({
  getPersonHref,
  highlightPersonId,
  photo,
}: PhotoFaceOverlayProps) {
  const [faces, setFaces] = useState<PhotoFaceAnnotation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activePersonId, setActivePersonId] = useState<string | null>(null)
  const [hoveredPersonId, setHoveredPersonId] = useState<string | null>(null)
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setFaces([])
    setActivePersonId(null)
    setHoveredPersonId(null)
    setSourceSize(null)

    void fetch(`/api/people/photos/${encodeURIComponent(photo.id)}/faces`)
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(
            data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
              ? data.error
              : 'Unable to load detected faces.',
          )
        }
        return data
      })
      .then((data) => {
        if (cancelled) return
        const rows = Array.isArray(data?.faces) ? (data.faces as PhotoFaceAnnotation[]) : []
        setFaces(rows)
        if (rows.length === 1) {
          setActivePersonId(rows[0].person_id)
        }
      })
      .catch((loadError) => {
        if (cancelled) return
        setError(loadError instanceof Error ? loadError.message : 'Unable to load detected faces.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [photo.id])

  const handleImageLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      const image = event.currentTarget
      setSourceSize({
        width: photo.width ?? image.naturalWidth,
        height: photo.height ?? image.naturalHeight,
      })
    },
    [photo.height, photo.width],
  )

  const focusedPersonId = hoveredPersonId ?? activePersonId
  const showFaceUi = !loading && faces.length > 0
  const dimensions = sourceSize ?? {
    width: photo.width ?? 1,
    height: photo.height ?? 1,
  }

  function focusPerson(personId: string) {
    setActivePersonId(personId)
    setHoveredPersonId(personId)
  }

  function togglePerson(personId: string) {
    setActivePersonId((current) => (current === personId ? null : personId))
    setHoveredPersonId(personId)
  }

  return (
    <div className="space-y-4">
      <div className="relative inline-block max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={photo.original_file_name}
          className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
          onLoad={handleImageLoad}
          src={photo.image_url}
        />

        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/25 text-sm text-white/85">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading detected faces…
          </div>
        ) : null}

        {showFaceUi && sourceSize ? (
          <div className="pointer-events-none absolute inset-0">
            {faces.map((face, index) => (
              <FaceMarker
                face={face}
                focused={focusedPersonId === face.person_id}
                index={index}
                isCurrentPerson={highlightPersonId === face.person_id}
                key={face.face_id}
                onActivate={() => focusPerson(face.person_id)}
                onDeactivate={() => setHoveredPersonId(null)}
                onToggle={() => togglePerson(face.person_id)}
                style={boxToPercent(face.bounding_box, dimensions.width, dimensions.height)}
              />
            ))}
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg bg-red-500/15 px-4 py-3 text-sm text-red-100">{error}</p>
      ) : null}

      {showFaceUi ? (
        <div className="mx-auto max-w-3xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
            Detected people
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {faces.map((face, index) => {
              const isFocused = focusedPersonId === face.person_id

              return (
                <FaceNameChip
                  active={activePersonId === face.person_id}
                  face={face}
                  getPersonHref={getPersonHref}
                  highlight={isFocused}
                  index={index}
                  isCurrentPerson={highlightPersonId === face.person_id}
                  key={face.person_id}
                  onActivate={() => focusPerson(face.person_id)}
                  onDeactivate={() => setHoveredPersonId(null)}
                />
              )
            })}
          </div>
          <p className="mt-2 text-center text-xs text-white/55">
            Tap or hover a numbered pin or name below to highlight a person.
          </p>
        </div>
      ) : null}
    </div>
  )
}
