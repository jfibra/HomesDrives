'use client'

import { useState } from 'react'
import { ImageIcon, X } from 'lucide-react'

import type { EventPhotoListItem } from '@/lib/portals/event-photos'
import { isPortalVideoFileName } from '@/lib/portals/upload-file-utils'

type EventAllPhotosGridProps = {
  photos: EventPhotoListItem[]
}

export default function EventAllPhotosGrid({ photos }: EventAllPhotosGridProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const lightboxPhoto = lightboxIndex != null ? photos[lightboxIndex] ?? null : null

  if (photos.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center text-slate-500">
        <ImageIcon className="mb-3 h-8 w-8 opacity-40" />
        <p className="text-sm font-medium text-slate-600">No photos found</p>
        <p className="mt-1 max-w-sm text-sm">Try a different search or upload photos to this event.</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {photos.map((photo, index) => (
          <button
            className="group overflow-hidden rounded-xl border border-slate-100 bg-white text-left shadow-sm transition hover:border-slate-200 hover:shadow"
            key={photo.id}
            onClick={() => setLightboxIndex(index)}
            type="button"
          >
            <div className="aspect-[5/4] overflow-hidden bg-slate-100">
              {isPortalVideoFileName(photo.original_file_name) ? (
                <video
                  className="h-full w-full object-contain object-top transition group-hover:scale-[1.02]"
                  muted
                  playsInline
                  preload="metadata"
                  src={photo.image_url}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={photo.original_file_name}
                  className="h-full w-full object-contain object-top transition group-hover:scale-[1.02]"
                  src={photo.image_url}
                />
              )}
            </div>
            <div className="space-y-0.5 px-2 py-2">
              <p className="truncate text-xs font-semibold text-[#10233f]">{photo.original_file_name}</p>
              {photo.folder_name ? (
                <p className="truncate text-[11px] text-slate-500">{photo.folder_name}</p>
              ) : null}
            </div>
          </button>
        ))}
      </div>

      {lightboxPhoto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxIndex(null)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setLightboxIndex(null)
          }}
          role="presentation"
        >
          <button
            aria-label="Close preview"
            className="absolute right-4 top-4 z-20 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            onClick={() => setLightboxIndex(null)}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="max-w-5xl text-center" onClick={(event) => event.stopPropagation()} role="presentation">
            <div className="mb-3 space-y-1 px-2">
              <p className="max-w-[90vw] truncate text-sm font-medium text-white sm:max-w-none">
                {lightboxPhoto.original_file_name}
              </p>
              {lightboxPhoto.folder_name ? (
                <p className="text-xs text-white/60">{lightboxPhoto.folder_name}</p>
              ) : null}
            </div>
            {isPortalVideoFileName(lightboxPhoto.original_file_name) ? (
              <video
                className="max-h-[70vh] w-auto max-w-[calc(100vw-2rem)] rounded-lg object-contain shadow-2xl sm:max-h-[80vh] sm:max-w-full"
                controls
                playsInline
                src={lightboxPhoto.image_url}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={lightboxPhoto.original_file_name}
                className="max-h-[70vh] w-auto max-w-[calc(100vw-2rem)] rounded-lg object-contain shadow-2xl sm:max-h-[80vh] sm:max-w-full"
                src={lightboxPhoto.image_url}
              />
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
