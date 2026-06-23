'use client'

import { ArrowRight } from 'lucide-react'

import {
  CATEGORY_PHOTO_OVERLAY,
  type NewsUploadCategory,
} from '@/lib/media/news-upload-categories'

export type MediaNewsCategoryRecord = {
  category: NewsUploadCategory
  folderCount: number
  photoCount: number
}

type MediaNewsCategoryRecordsProps = {
  activeSlug: string | null
  onSelectCategory: (slug: string) => void
  records: MediaNewsCategoryRecord[]
}

export default function MediaNewsCategoryRecords({
  activeSlug,
  onSelectCategory,
  records,
}: MediaNewsCategoryRecordsProps) {
  if (records.length === 0) return null

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-headline text-xl font-semibold" style={{ color: 'var(--ds-primary)' }}>
          News by category
        </h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
          Categories where you have uploaded news content
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {records.map(({ category, folderCount, photoCount }) => {
          const Icon = category.icon
          const isActive = activeSlug === category.slug

          return (
            <button
              className="group flex h-full flex-col overflow-hidden rounded-[1.25rem] border text-left transition duration-300 hover:-translate-y-0.5 hover:shadow-lg"
              key={category.slug}
              onClick={() => onSelectCategory(category.slug)}
              style={{
                borderColor: isActive ? 'var(--ds-primary)' : 'rgba(196,198,207,0.45)',
                backgroundColor: 'var(--ds-surface-container-lowest)',
                boxShadow: isActive ? '0 0 0 1px var(--ds-primary)' : undefined,
              }}
              type="button"
            >
              <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  src={category.previewImageUrl}
                />
                <div className={`absolute inset-0 ${CATEGORY_PHOTO_OVERLAY}`} />
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-90"
                  style={{ background: category.previewTint }}
                />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4">
                  <div>
                    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur-sm">
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-semibold text-white">{category.label}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-white/80 transition group-hover:translate-x-0.5" />
                </div>
              </div>
              <div className="px-4 py-3">
                <p className="text-xs font-medium" style={{ color: 'var(--ds-on-surface-variant)' }}>
                  {folderCount} folder{folderCount !== 1 ? 's' : ''} · {photoCount} photo
                  {photoCount !== 1 ? 's' : ''}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
