'use client'

import { useState } from 'react'
import { ImageIcon, X } from 'lucide-react'

import { isPortalVideoFileName } from '@/lib/portals/upload-file-utils'
import type { PortalPhoto } from '@/lib/portals/types'

type EventPhotographerPhotosProps = {
  photos: PortalPhoto[]
}

export default function EventPhotographerPhotos({ photos }: EventPhotographerPhotosProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const lightboxPhoto = lightboxIndex != null ? photos[lightboxIndex] ?? null : null

  if (photos.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center text-slate-500">
        <ImageIcon className="mb-3 h-8 w-8 opacity-40" />
        <p className="text-sm font-medium text-slate-600">No photos yet</p>
        <p className="mt-1 max-w-sm text-sm">Photos this photographer uploads will appear here.</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {photos.map((photo, index) => (
          <button
            className="group aspect-[5/4] overflow-hidden rounded-xl border border-slate-100 bg-slate-100"
            key={photo.id}
            onClick={() => setLightboxIndex(index)}
            type="button"
          >
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
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            onClick={() => setLightboxIndex(null)}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="max-h-[90vh] max-w-5xl"
            onClick={(event) => event.stopPropagation()}
            role="presentation"
          >
            {isPortalVideoFileName(lightboxPhoto.original_file_name) ? (
              <video
                className="max-h-[90vh] max-w-full rounded-lg"
                controls
                playsInline
                src={lightboxPhoto.image_url}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={lightboxPhoto.original_file_name}
                className="max-h-[90vh] max-w-full rounded-lg object-contain"
                src={lightboxPhoto.image_url}
              />
            )}
            <p className="mt-3 text-center text-sm text-white/80">{lightboxPhoto.original_file_name}</p>
          </div>
        </div>
      ) : null}
    </>
  )
}
