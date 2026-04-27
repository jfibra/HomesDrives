'use client'

import { useEffect, useMemo, useState } from 'react'

import type { AlbumsMarketplacePhoto } from '@/lib/server/albums'

type PhotoWallProps = {
  photos: AlbumsMarketplacePhoto[]
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Unknown date'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown date'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function wallTileClass(index: number) {
  const pattern = index % 12

  if (pattern === 0) {
    return 'md:col-span-8 md:row-span-2 lg:col-span-6'
  }
  if (pattern === 1) {
    return 'md:col-span-4 md:row-span-1 lg:col-span-3'
  }
  if (pattern === 2) {
    return 'md:col-span-4 md:row-span-1 lg:col-span-3'
  }
  if (pattern === 3) {
    return 'md:col-span-6 md:row-span-2 lg:col-span-4'
  }
  if (pattern === 4) {
    return 'md:col-span-6 md:row-span-1 lg:col-span-4'
  }
  if (pattern === 5) {
    return 'md:col-span-6 md:row-span-1 lg:col-span-4'
  }
  if (pattern === 6) {
    return 'md:col-span-4 md:row-span-2 lg:col-span-3'
  }
  if (pattern === 7) {
    return 'md:col-span-8 md:row-span-1 lg:col-span-6'
  }
  if (pattern === 8) {
    return 'md:col-span-4 md:row-span-1 lg:col-span-3'
  }
  if (pattern === 9) {
    return 'md:col-span-4 md:row-span-1 lg:col-span-3'
  }
  if (pattern === 10) {
    return 'md:col-span-6 md:row-span-1 lg:col-span-4'
  }

  return 'md:col-span-6 md:row-span-2 lg:col-span-4'
}

export default function PhotoWall({ photos }: PhotoWallProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const activePhoto = useMemo(() => {
    if (activeIndex == null) {
      return null
    }

    return photos[activeIndex] ?? null
  }, [activeIndex, photos])

  function openLightbox(index: number) {
    setActiveIndex(index)
  }

  function closeLightbox() {
    setActiveIndex(null)
  }

  function goToPrevious() {
    if (activeIndex == null) {
      return
    }

    setActiveIndex((activeIndex - 1 + photos.length) % photos.length)
  }

  function goToNext() {
    if (activeIndex == null) {
      return
    }

    setActiveIndex((activeIndex + 1) % photos.length)
  }

  useEffect(() => {
    if (activeIndex == null) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeLightbox()
      }

      if (event.key === 'ArrowLeft') {
        goToPrevious()
      }

      if (event.key === 'ArrowRight') {
        goToNext()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [activeIndex])

  if (photos.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-[#001f3f]/20 bg-[#001f3f]/[0.02] p-14 text-center">
        <h2 className="text-4xl font-semibold text-[#001f3f]">No photos found</h2>
        <p className="mt-2 text-sm text-[#001f3f]/70">
          Try a broader search term or clear one of the active filters.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-12 md:[grid-auto-rows:170px] lg:gap-4 lg:[grid-auto-rows:200px]">
        {photos.map((photo, index) => (
          <button
            className={`group relative overflow-hidden rounded-2xl border border-[#001f3f]/10 bg-white text-left shadow-[0_35px_70px_-55px_rgba(0,31,63,0.9)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_40px_75px_-45px_rgba(0,31,63,0.9)] focus-visible:outline-2 focus-visible:outline-[#c1121f] ${wallTileClass(index)}`}
            key={photo.id}
            onClick={() => openLightbox(index)}
            type="button"
          >
            <img
              alt={photo.original_file_name}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              loading="lazy"
              src={photo.image_url}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#001f3f]/80 via-[#001f3f]/20 to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="absolute bottom-0 left-0 right-0 space-y-1 p-4 text-white">
              <p className="line-clamp-1 text-sm font-semibold">{photo.original_file_name}</p>
              <p className="line-clamp-1 text-xs text-white/80">
                {photo.uploader_name} •{' '}
                {[photo.place_name, photo.city, photo.province, photo.country]
                  .filter(Boolean)
                  .join(', ') || 'Unspecified location'}
              </p>
            </div>
          </button>
        ))}
      </div>

      {activePhoto ? (
        <div className="fixed inset-0 z-[80] bg-black/95 backdrop-blur-md">
          <button
            aria-label="Close preview"
            className="absolute right-4 top-4 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/50 text-xl text-white transition hover:bg-black/70"
            onClick={closeLightbox}
            type="button"
          >
            x
          </button>

          <button
            aria-label="Previous image"
            className="absolute left-4 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/50 text-2xl text-white transition hover:bg-black/70"
            onClick={goToPrevious}
            type="button"
          >
            ‹
          </button>

          <button
            aria-label="Next image"
            className="absolute right-4 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/50 text-2xl text-white transition hover:bg-black/70"
            onClick={goToNext}
            type="button"
          >
            ›
          </button>

          <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-5 pb-5 pt-16">
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-black/40">
              <img
                alt={activePhoto.original_file_name}
                className="max-h-full w-auto max-w-full object-contain"
                src={activePhoto.image_url}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-white">
              <div className="space-y-1">
                <p className="text-base font-semibold">{activePhoto.original_file_name}</p>
                <p className="text-sm text-white/75">by {activePhoto.uploader_name}</p>
                <p className="text-sm text-white/75">
                  {[activePhoto.place_name, activePhoto.city, activePhoto.province, activePhoto.country]
                    .filter(Boolean)
                    .join(', ') || 'Unspecified location'}
                </p>
              </div>
              <div className="space-y-1 text-right text-xs text-white/70">
                <p>Uploaded {formatDate(activePhoto.created_at)}</p>
                <p>
                  {(activeIndex ?? 0) + 1} / {photos.length}
                </p>
              </div>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {photos.map((photo, thumbIndex) => (
                <button
                  aria-label={`View ${photo.original_file_name}`}
                  className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border transition ${
                    thumbIndex === activeIndex
                      ? 'border-[#c1121f] ring-2 ring-[#c1121f]/40'
                      : 'border-white/20 hover:border-white/60'
                  }`}
                  key={`${photo.id}-thumb`}
                  onClick={() => setActiveIndex(thumbIndex)}
                  type="button"
                >
                  <img
                    alt={photo.original_file_name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    src={photo.image_url}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
