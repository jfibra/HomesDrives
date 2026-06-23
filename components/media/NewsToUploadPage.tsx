'use client'

import { ArrowRight } from 'lucide-react'

import {
  CATEGORY_PHOTO_OVERLAY,
  NEWS_UPLOAD_CATEGORIES,
  type NewsUploadCategory,
} from '@/lib/media/news-upload-categories'

type NewsToUploadPageProps = {
  onSelectCategory: (category: NewsUploadCategory) => void
}

export default function NewsToUploadPage({ onSelectCategory }: NewsToUploadPageProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
      <div>
        <h1 className="font-headline text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: 'var(--ds-primary)' }}>
          News to Upload
        </h1>
        <p className="mt-2 max-w-2xl text-sm sm:text-base" style={{ color: 'var(--ds-on-surface-variant)' }}>
          Choose a category for your story. We&apos;ll open a new folder with the right place type
          so your upload is organized for Homes.ph.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {NEWS_UPLOAD_CATEGORIES.map((category) => {
            const Icon = category.icon

            return (
              <button
                className="group flex h-full flex-col overflow-hidden rounded-[1.35rem] border text-left transition duration-300 hover:-translate-y-0.5 hover:shadow-xl"
                key={category.label}
                onClick={() => onSelectCategory(category)}
                style={{
                  borderColor: 'rgba(196,198,207,0.45)',
                  backgroundColor: 'var(--ds-surface-container-lowest)',
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
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
                    <div>
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur-sm">
                        <Icon className="h-5 w-5" />
                      </div>
                      <p className="text-lg font-semibold text-white">{category.label}</p>
                    </div>
                    <ArrowRight className="h-5 w-5 shrink-0 text-white/80 transition group-hover:translate-x-0.5 group-hover:text-white" />
                  </div>
                </div>
                <div className="flex flex-1 px-5 py-4">
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--ds-on-surface-variant)' }}>
                    {category.description}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
