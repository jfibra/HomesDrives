"use client";

import { useEffect, useMemo, useState } from "react";

import type { AlbumsMarketplacePhoto } from "@/lib/server/albums";
import { ImageWithWatermark } from "@/components/ImageWithWatermark";

type PhotoWallProps = {
  photos: AlbumsMarketplacePhoto[];
};

function formatDate(value: string | null) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default function PhotoWall({ photos }: PhotoWallProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const activePhoto = useMemo(
    () => (activeIndex != null ? photos[activeIndex] ?? null : null),
    [activeIndex, photos]
  );

  function closeLightbox() {
    setActiveIndex(null);
  }

  function goToPrevious() {
    setActiveIndex((i) =>
      i == null ? null : (i - 1 + photos.length) % photos.length
    );
  }

  function goToNext() {
    setActiveIndex((i) => (i == null ? null : (i + 1) % photos.length));
  }

  useEffect(() => {
    if (activeIndex == null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") goToPrevious();
      if (e.key === "ArrowRight") goToNext();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  if (photos.length === 0) {
    return (
      <div
        className="py-24 text-center rounded-xl border border-dashed"
        style={{ borderColor: "#c4c6cf" }}
      >
        <p
          className="text-3xl font-semibold mb-2"
          style={{ fontFamily: "'Noto Serif', serif", color: "#002045" }}
        >
          No photos found
        </p>
        <p className="text-sm" style={{ color: "#74777f" }}>
          Try a broader search term or clear one of the active filters.
        </p>
      </div>
    );
  }

  return (
    <>
      {/*
        CSS columns masonry — each image renders at its natural aspect ratio.
        No fixed row heights means zero whitespace gaps between images.
      */}
      <div
        className="columns-1 sm:columns-2 lg:columns-3"
        style={{ columnGap: "12px" }}
      >
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            className="break-inside-avoid group relative block w-full overflow-hidden rounded-xl border cursor-pointer text-left focus-visible:outline-2"
            style={{
              marginBottom: "12px",
              borderColor: "#c4c6cf",
              outlineColor: "#b52426",
            }}
            onClick={() => setActiveIndex(index)}
            type="button"
          >
            {/* img with h-auto fills the column width and respects natural aspect ratio */}
            <ImageWithWatermark
              photo={photo}
              className="w-full h-auto block transition-transform duration-700 group-hover:scale-[1.04]"
              loading="lazy"
            />
            {/* Hover overlay */}
            <div
              className="absolute inset-0 flex flex-col justify-end p-5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{
                background:
                  "linear-gradient(to top, rgba(0,32,69,0.92) 0%, rgba(0,32,69,0.25) 55%, transparent 100%)",
              }}
            >
              <p
                className="text-white font-bold uppercase mb-1.5 truncate"
                style={{ fontSize: "10px", letterSpacing: "0.18em" }}
              >
                {photo.original_file_name}
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-white/90 text-sm font-medium truncate">
                  {photo.uploader_name}
                </span>
                <span className="text-white/70 text-xs shrink-0">
                  {[photo.place_name, photo.city, photo.province]
                    .filter(Boolean)
                    .join(", ") || "Unspecified"}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {activePhoto ? (
        <div
          className="fixed inset-0 z-[80] flex flex-col"
          style={{
            backgroundColor: "rgba(0,0,0,0.97)",
            backdropFilter: "blur(10px)",
          }}
        >
          <button
            aria-label="Close preview"
            className="absolute right-5 top-5 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/25 text-white transition hover:bg-white/10"
            onClick={closeLightbox}
            type="button"
          >
            ✕
          </button>

          <button
            aria-label="Previous image"
            className="absolute left-5 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 text-white text-2xl transition hover:bg-white/10"
            onClick={goToPrevious}
            type="button"
          >
            ‹
          </button>

          <button
            aria-label="Next image"
            className="absolute right-5 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 text-white text-2xl transition hover:bg-white/10"
            onClick={goToNext}
            type="button"
          >
            ›
          </button>

          <div className="mx-auto flex h-full w-full max-w-6xl flex-col px-5 pb-5 pt-16">
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={activePhoto.original_file_name}
                className="max-h-full w-auto max-w-full object-contain"
                src={activePhoto.image_url}
              />
            </div>

            <div
              className="mt-4 flex flex-wrap items-end justify-between gap-4 rounded-xl border border-white/10 px-5 py-4 text-white"
              style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
            >
              <div className="space-y-1">
                <p className="font-semibold">
                  {activePhoto.original_file_name}
                </p>
                <p className="text-sm text-white/70">
                  by {activePhoto.uploader_name}
                </p>
                <p className="text-sm text-white/70">
                  {[
                    activePhoto.place_name,
                    activePhoto.city,
                    activePhoto.province,
                    activePhoto.country,
                  ]
                    .filter(Boolean)
                    .join(", ") || "Unspecified location"}
                </p>
              </div>
              <div className="text-right text-xs text-white/60 space-y-1">
                <p>Uploaded {formatDate(activePhoto.created_at)}</p>
                <p>
                  {(activeIndex ?? 0) + 1} / {photos.length}
                </p>
              </div>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {photos.map((photo, thumbIndex) => (
                <button
                  key={`${photo.id}-thumb`}
                  aria-label={`View ${photo.original_file_name}`}
                  className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                    thumbIndex === activeIndex
                      ? "border-[#b52426]"
                      : "border-white/20 hover:border-white/50"
                  }`}
                  onClick={() => setActiveIndex(thumbIndex)}
                  type="button"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
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
  );
}
