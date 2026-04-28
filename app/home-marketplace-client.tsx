'use client'

import Link from 'next/link'
import { Cormorant_Garamond, Space_Grotesk } from 'next/font/google'

import type { AlbumTaxonomyOption, AlbumsMarketplacePhoto, AlbumsMarketplaceSort } from '@/lib/server/albums'
import PhotoWall from '@/components/marketplace/photo-wall'

type HomeMarketplaceClientProps = {
  page: number
  pagesToShow: number[]
  photos: AlbumsMarketplacePhoto[]
  placeType: string
  placeTypes: AlbumTaxonomyOption[]
  query: string
  safePage: number
  sort: AlbumsMarketplaceSort
  tag: string
  tags: AlbumTaxonomyOption[]
  totalCount: number
  totalPages: number
}

const headingFont = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['600', '700'],
})

const bodyFont = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

function toTitleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function createUrlWithFilters(params: {
  page?: number
  placeType: string
  query: string
  sort: AlbumsMarketplaceSort
  tag: string
}) {
  const next = new URLSearchParams()

  if (params.query) {
    next.set('q', params.query)
  }

  if (params.placeType) {
    next.set('placeType', params.placeType)
  }

  if (params.tag) {
    next.set('tag', params.tag)
  }

  if (params.sort !== 'newest') {
    next.set('sort', params.sort)
  }

  if (params.page && params.page > 1) {
    next.set('page', String(params.page))
  }

  const value = next.toString()

  return value ? `/?${value}` : '/'
}

function countActiveFilters(params: {
  placeType: string
  query: string
  sort: AlbumsMarketplaceSort
  tag: string
}) {
  let count = 0

  if (params.query) {
    count += 1
  }

  if (params.placeType) {
    count += 1
  }

  if (params.tag) {
    count += 1
  }

  if (params.sort !== 'newest') {
    count += 1
  }

  return count
}

export default function HomeMarketplaceClient({
  page,
  pagesToShow,
  photos,
  placeType,
  placeTypes,
  query,
  safePage,
  sort,
  tag,
  tags,
  totalCount,
  totalPages,
}: HomeMarketplaceClientProps) {
  const featuredPhotos = photos.slice(0, 5)
  const activeFilters = countActiveFilters({ placeType, query, sort, tag })
  const contributorsCount = new Set(photos.map((photo) => photo.uploader_name)).size
  const locationsCount = new Set(
    photos
      .map((photo) => [photo.city, photo.province, photo.country].filter(Boolean).join(', '))
      .filter(Boolean),
  ).size

  function createPageHref(nextPage: number) {
    return createUrlWithFilters({
      page: nextPage,
      placeType,
      query,
      sort,
      tag,
    })
  }

  return (
    <main className={`min-h-screen bg-white text-[#001f3f] ${bodyFont.className}`}>
      <section className="relative overflow-hidden border-b border-[#001f3f]/10 bg-[radial-gradient(circle_at_8%_10%,rgba(193,18,31,0.12),transparent_30%),radial-gradient(circle_at_88%_15%,rgba(0,31,63,0.12),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(0,31,63,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,31,63,0.03)_1px,transparent_1px)] bg-[size:34px_34px]" />
        <div className="relative mx-auto max-w-[96rem] px-4 pb-8 pt-8 sm:px-6 lg:px-8 xl:px-10">
          <header>
            <nav className="flex items-center justify-between rounded-2xl border border-[#001f3f]/10 bg-white/85 px-4 py-3 shadow-[0_20px_60px_-45px_rgba(0,31,63,0.65)] backdrop-blur sm:px-6">
              <Link className="inline-flex items-center gap-3" href="/">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#001f3f] text-sm font-bold text-white">
                  HD
                </span>
                <span className="text-sm font-semibold tracking-wide text-[#001f3f] sm:text-base">
                  HomesDrives Photos
                </span>
              </Link>
              <div className="hidden items-center gap-2 text-xs sm:flex">
                <span className="rounded-full border border-[#001f3f]/20 bg-white px-3 py-1.5 font-semibold text-[#001f3f]">
                  Premium Marketplace
                </span>
                <span className="rounded-full border border-[#c1121f]/25 bg-[#c1121f]/10 px-3 py-1.5 font-semibold text-[#c1121f]">
                  {totalCount.toLocaleString('en-US')} photos
                </span>
              </div>
            </nav>
          </header>

          <div className="grid gap-7 pt-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div className="space-y-6">
              <p className="inline-flex items-center rounded-full border border-[#001f3f]/15 bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#001f3f]">
                Curated visual intelligence for real estate
              </p>
              <h1 className={`${headingFont.className} max-w-3xl text-5xl leading-[0.95] tracking-tight text-[#001f3f] sm:text-6xl lg:text-7xl`}>
                Discover striking home and location photography at scale.
              </h1>
              <p className="max-w-2xl text-base text-[#001f3f]/75 sm:text-lg">
                A premium stock-style catalog where every contributor adds visual depth.
                Search by place, filter by taxonomy, and open any image in an immersive viewer.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {featuredPhotos.map((photo, index) => (
                <div
                  className={`overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_24px_60px_-42px_rgba(0,31,63,0.8)] ${
                    index === 0 ? 'col-span-2 row-span-2' : ''
                  }`}
                  key={photo.id}
                >
                  <img
                    alt={photo.original_file_name}
                    className={`h-full w-full object-cover transition duration-500 hover:scale-[1.03] ${
                      index === 0 ? 'aspect-[4/3]' : 'aspect-square'
                    }`}
                    loading="lazy"
                    src={photo.image_url}
                  />
                </div>
              ))}
            </div>
          </div>

          <form
            action="/"
            className="mt-8 rounded-3xl border border-[#001f3f]/10 bg-white p-3 shadow-[0_35px_90px_-45px_rgba(0,31,63,0.55)] sm:p-4"
          >
            <div className="grid gap-3 lg:grid-cols-[2.4fr_1fr_1fr_1fr_auto]">
              <input
                className="h-12 rounded-2xl border border-[#001f3f]/20 bg-white px-4 text-sm text-[#001f3f] outline-none transition focus:border-[#001f3f] focus:ring-2 focus:ring-[#001f3f]/15"
                defaultValue={query}
                name="q"
                placeholder="Search homes, neighborhoods, cities, contributors"
                type="search"
              />
              <select
                className="h-12 rounded-2xl border border-[#001f3f]/20 bg-white px-3 text-sm text-[#001f3f] outline-none transition focus:border-[#001f3f] focus:ring-2 focus:ring-[#001f3f]/15"
                defaultValue={placeType}
                name="placeType"
              >
                <option value="">All place types</option>
                {placeTypes.map((option) => (
                  <option key={option.slug} value={option.label}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                className="h-12 rounded-2xl border border-[#001f3f]/20 bg-white px-3 text-sm text-[#001f3f] outline-none transition focus:border-[#001f3f] focus:ring-2 focus:ring-[#001f3f]/15"
                defaultValue={tag}
                name="tag"
              >
                <option value="">All tags</option>
                {tags.map((option) => (
                  <option key={option.slug} value={option.label}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                className="h-12 rounded-2xl border border-[#001f3f]/20 bg-white px-3 text-sm text-[#001f3f] outline-none transition focus:border-[#001f3f] focus:ring-2 focus:ring-[#001f3f]/15"
                defaultValue={sort}
                name="sort"
              >
                <option value="newest">Newest uploads</option>
                <option value="oldest">Oldest uploads</option>
                <option value="captured">Latest capture date</option>
              </select>
              <div className="flex gap-2">
                <button
                  className="h-12 flex-1 rounded-2xl bg-[#001f3f] px-4 text-sm font-semibold text-white transition hover:bg-[#052d58]"
                  type="submit"
                >
                  Search
                </button>
                <Link
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#c1121f]/35 px-4 text-sm font-semibold text-[#c1121f] transition hover:bg-[#c1121f] hover:text-white"
                  href="/"
                >
                  Reset
                </Link>
              </div>
            </div>
          </form>
        </div>
      </section>

      <section className="w-full px-3 pb-14 pt-8 sm:px-5 lg:px-7">
        <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-6 h-[calc(100vh-3rem)] overflow-y-auto rounded-3xl border border-[#001f3f]/10 bg-white p-5 shadow-[0_20px_60px_-50px_rgba(0,31,63,0.6)]">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#001f3f]/70">
                  Filters
                </p>
                <p className="text-sm text-[#001f3f]/75">
                  {activeFilters} active • page {page} of {totalPages}
                </p>
              </div>

              <div className="mt-5 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#001f3f]/70">
                  Sort
                </p>
                {(['newest', 'oldest', 'captured'] as AlbumsMarketplaceSort[]).map((sortOption) => {
                  const selected = sortOption === sort

                  return (
                    <Link
                      className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${
                        selected
                          ? 'border-[#001f3f] bg-[#001f3f] text-white'
                          : 'border-[#001f3f]/15 text-[#001f3f] hover:bg-[#001f3f]/6'
                      }`}
                      href={createUrlWithFilters({
                        page: 1,
                        placeType,
                        query,
                        sort: sortOption,
                        tag,
                      })}
                      key={sortOption}
                    >
                      <span>{toTitleCase(sortOption)}</span>
                      {selected ? <span>•</span> : null}
                    </Link>
                  )
                })}
              </div>

              <div className="mt-6 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#001f3f]/70">
                  Place Types
                </p>
                <div className="space-y-2">
                  {placeTypes.slice(0, 14).map((option) => {
                    const selected = option.label === placeType

                    return (
                      <Link
                        className={`block rounded-xl border px-3 py-2 text-sm transition ${
                          selected
                            ? 'border-[#c1121f] bg-[#c1121f] text-white'
                            : 'border-[#001f3f]/15 text-[#001f3f] hover:bg-[#001f3f]/6'
                        }`}
                        href={createUrlWithFilters({
                          page: 1,
                          placeType: selected ? '' : option.label,
                          query,
                          sort,
                          tag,
                        })}
                        key={option.slug}
                      >
                        {option.label}
                      </Link>
                    )
                  })}
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#001f3f]/70">
                  Tags
                </p>
                <div className="flex flex-wrap gap-2">
                  {tags.slice(0, 18).map((option) => {
                    const selected = option.label === tag

                    return (
                      <Link
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          selected
                            ? 'border-[#001f3f] bg-[#001f3f] text-white'
                            : 'border-[#001f3f]/20 text-[#001f3f] hover:bg-[#001f3f]/8'
                        }`}
                        href={createUrlWithFilters({
                          page: 1,
                          placeType,
                          query,
                          sort,
                          tag: selected ? '' : option.label,
                        })}
                        key={option.slug}
                      >
                        {option.label}
                      </Link>
                    )
                  })}
                </div>
              </div>

              <Link
                className="mt-7 inline-flex w-full items-center justify-center rounded-xl border border-[#c1121f]/35 bg-[#c1121f]/10 px-4 py-2.5 text-sm font-semibold text-[#c1121f] transition hover:bg-[#c1121f] hover:text-white"
                href="/"
              >
                Clear all filters
              </Link>
            </div>
          </aside>

          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#001f3f]/10 bg-white p-4 shadow-[0_20px_50px_-45px_rgba(0,31,63,0.9)]">
                <p className="text-xs uppercase tracking-[0.14em] text-[#001f3f]/65">Visible Photos</p>
                <p className="mt-2 text-2xl font-bold text-[#001f3f]">{photos.length}</p>
              </div>
              <div className="rounded-2xl border border-[#001f3f]/10 bg-white p-4 shadow-[0_20px_50px_-45px_rgba(0,31,63,0.9)]">
                <p className="text-xs uppercase tracking-[0.14em] text-[#001f3f]/65">Contributors</p>
                <p className="mt-2 text-2xl font-bold text-[#001f3f]">{contributorsCount}</p>
              </div>
              <div className="rounded-2xl border border-[#001f3f]/10 bg-white p-4 shadow-[0_20px_50px_-45px_rgba(0,31,63,0.9)]">
                <p className="text-xs uppercase tracking-[0.14em] text-[#001f3f]/65">Locations</p>
                <p className="mt-2 text-2xl font-bold text-[#001f3f]">{locationsCount}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#001f3f]/10 bg-white p-4">
              <p className="text-sm text-[#001f3f]/75">
                Showing <span className="font-semibold text-[#001f3f]">{photos.length}</span> of{' '}
                <span className="font-semibold text-[#001f3f]">{totalCount}</span> photos
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {query ? (
                  <span className="rounded-full border border-[#001f3f]/15 bg-[#001f3f]/5 px-3 py-1 text-[#001f3f]">
                    Query: {query}
                  </span>
                ) : null}
                {placeType ? (
                  <span className="rounded-full border border-[#001f3f]/15 bg-[#001f3f]/5 px-3 py-1 text-[#001f3f]">
                    Place: {placeType}
                  </span>
                ) : null}
                {tag ? (
                  <span className="rounded-full border border-[#c1121f]/20 bg-[#c1121f]/10 px-3 py-1 text-[#c1121f]">
                    Tag: {tag}
                  </span>
                ) : null}
                <span className="rounded-full border border-[#001f3f]/15 bg-white px-3 py-1 text-[#001f3f]">
                  Sort: {toTitleCase(sort)}
                </span>
              </div>
            </div>

            <PhotoWall photos={photos} />

            <nav className="mt-10 flex flex-wrap items-center justify-center gap-2" aria-label="Photo pages">
              <Link
                aria-disabled={safePage <= 1}
                className="inline-flex h-10 items-center rounded-xl border border-[#001f3f]/20 px-4 text-sm font-semibold text-[#001f3f] transition hover:bg-[#001f3f] hover:text-white aria-disabled:pointer-events-none aria-disabled:opacity-40"
                href={createPageHref(Math.max(1, safePage - 1))}
              >
                Previous
              </Link>

              {pagesToShow.map((pageNumber) => (
                <Link
                  aria-current={pageNumber === safePage ? 'page' : undefined}
                  className={`inline-flex h-10 min-w-10 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition ${
                    pageNumber === safePage
                      ? 'border-[#c1121f] bg-[#c1121f] text-white'
                      : 'border-[#001f3f]/20 text-[#001f3f] hover:bg-[#001f3f] hover:text-white'
                  }`}
                  href={createPageHref(pageNumber)}
                  key={pageNumber}
                >
                  {pageNumber}
                </Link>
              ))}

              <Link
                aria-disabled={safePage >= totalPages}
                className="inline-flex h-10 items-center rounded-xl border border-[#001f3f]/20 px-4 text-sm font-semibold text-[#001f3f] transition hover:bg-[#001f3f] hover:text-white aria-disabled:pointer-events-none aria-disabled:opacity-40"
                href={createPageHref(Math.min(totalPages, safePage + 1))}
              >
                Next
              </Link>
            </nav>
          </div>
        </div>
      </section>
    </main>
  )
}
