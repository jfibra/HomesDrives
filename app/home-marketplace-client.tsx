'use client'

import Link from 'next/link'

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

function createUrlWithFilters(params: {
  page?: number
  placeType: string
  query: string
  sort: AlbumsMarketplaceSort
  tag: string
}) {
  const next = new URLSearchParams()
  if (params.query) next.set('q', params.query)
  if (params.placeType) next.set('placeType', params.placeType)
  if (params.tag) next.set('tag', params.tag)
  if (params.sort !== 'newest') next.set('sort', params.sort)
  if (params.page && params.page > 1) next.set('page', String(params.page))
  const value = next.toString()
  return value ? `/?${value}` : '/'
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
  const featuredPhotos = photos.slice(0, 4)
  const contributorsCount = new Set(photos.map((p) => p.uploader_name)).size
  const locationsCount = new Set(
    photos
      .map((p) => [p.city, p.province, p.country].filter(Boolean).join(', '))
      .filter(Boolean),
  ).size

  function createPageHref(nextPage: number) {
    return createUrlWithFilters({ page: nextPage, placeType, query, sort, tag })
  }

  return (
    <div style={{ backgroundColor: '#f9f9ff', color: '#121c2c', minHeight: '100vh' }}>

      {/* ── Fixed top navigation ────────────────────────────────────── */}
      <header
        className="fixed inset-x-0 top-0 z-50 flex h-20 items-center"
        style={{
          backgroundColor: 'rgba(249,249,255,0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #c4c6cf',
        }}
      >
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-8">
          <Link href="/" className="inline-flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Homes%20Drive%20Logo%20Blue.png"
              alt="Homes.ph Drive"
              className="h-10 w-auto object-contain"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {['MARKETPLACE', 'ABOUT', 'CONTACT'].map((label) => (
              <span
                key={label}
                className="text-xs font-semibold tracking-[0.18em] cursor-pointer transition-opacity hover:opacity-70"
                style={{ color: '#43474e' }}
              >
                {label}
              </span>
            ))}
          </nav>

          <Link
            href="/"
            className="hidden sm:inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: '#b52426' }}
          >
            Explore Photos
          </Link>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="pt-20" style={{ backgroundColor: '#f0f3ff' }}>
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-12 px-8 py-20 lg:grid-cols-2 lg:items-center">

          {/* Left: copy */}
          <div className="space-y-7">
            <p
              className="inline-block text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ color: '#b52426' }}
            >
              Real Estate Photography Marketplace
            </p>
            <h1
              className="text-5xl font-bold leading-tight lg:text-6xl"
              style={{ color: '#002045' }}
            >
              Discover striking home and location photography at scale.
            </h1>
            <p className="text-lg leading-relaxed" style={{ color: '#43474e' }}>
              A curated collection of premium real estate imagery. Browse by place type, filter by
              style tags, and open any photo in an immersive full-screen viewer.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <a
                href="#marketplace"
                className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ backgroundColor: '#002045' }}
              >
                Explore Photos
              </a>
              <a
                href="#marketplace"
                className="inline-flex items-center gap-2 rounded-full border px-7 py-3.5 text-sm font-semibold transition hover:opacity-70"
                style={{ borderColor: '#002045', color: '#002045' }}
              >
                Join as Contributor
              </a>
            </div>
          </div>

          {/* Right: 2-column featured photo collage */}
          {featuredPhotos.length >= 2 ? (
            <div className="grid grid-cols-2 gap-3">
              {/* left column — offset top so the two columns stagger */}
              <div className="flex flex-col gap-3 pt-12">
                {featuredPhotos.filter((_, i) => i % 2 === 0).map((photo) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={photo.id}
                    src={photo.image_url}
                    alt={photo.original_file_name}
                    className="w-full rounded-2xl object-cover"
                    style={{ border: '1px solid #c4c6cf' }}
                    loading="eager"
                  />
                ))}
              </div>
              {/* right column */}
              <div className="flex flex-col gap-3">
                {featuredPhotos.filter((_, i) => i % 2 !== 0).map((photo) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={photo.id}
                    src={photo.image_url}
                    alt={photo.original_file_name}
                    className="w-full rounded-2xl object-cover"
                    style={{ border: '1px solid #c4c6cf' }}
                    loading="eager"
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────────────── */}
      <section className="py-12" style={{ backgroundColor: '#f9f9ff', borderBottom: '1px solid #c4c6cf' }}>
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-6 px-8 sm:grid-cols-3">
          {[
            { label: 'TOTAL PHOTOS', value: totalCount.toLocaleString('en-US') },
            { label: 'CONTRIBUTORS', value: contributorsCount.toLocaleString('en-US') },
            { label: 'LOCATIONS', value: locationsCount.toLocaleString('en-US') },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-2xl p-6 text-center"
              style={{ border: '1px solid #c4c6cf', backgroundColor: '#ffffff' }}
            >
              <p
                className="mb-1 text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: '#74777f' }}
              >
                {label}
              </p>
              <p className="text-4xl font-bold" style={{ color: '#002045' }}>
                {value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Marketplace section ────────────────────────────────────────── */}
      <section id="marketplace" className="mx-auto max-w-[1280px] px-8 py-20">
        <div className="flex gap-16">

          {/* Sidebar */}
          <aside className="hidden w-72 shrink-0 lg:block">
            <div className="sticky top-24 space-y-8">

              {/* Search form */}
              <form action="/" className="flex gap-2">
                {placeType && <input type="hidden" name="placeType" value={placeType} />}
                {tag && <input type="hidden" name="tag" value={tag} />}
                {sort !== 'newest' && <input type="hidden" name="sort" value={sort} />}
                <input
                  type="search"
                  name="q"
                  defaultValue={query}
                  placeholder="Search photos…"
                  className="flex-1 rounded-xl border px-4 py-2.5 text-sm outline-none transition focus:ring-2"
                  style={{ borderColor: '#c4c6cf', color: '#121c2c', focusRingColor: '#002045' } as React.CSSProperties}
                />
                <button
                  type="submit"
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ backgroundColor: '#002045' }}
                >
                  Go
                </button>
              </form>

              {/* Place Types */}
              <div>
                <p
                  className="mb-3 text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: '#74777f' }}
                >
                  Place Types
                </p>
                <div className="space-y-1">
                  {placeTypes.map((option) => {
                    const active = option.label === placeType
                    return (
                      <Link
                        key={option.slug}
                        href={createUrlWithFilters({
                          page: 1,
                          placeType: active ? '' : option.label,
                          query,
                          sort,
                          tag,
                        })}
                        className="block rounded-lg px-3 py-2 text-sm font-medium transition"
                        style={
                          active
                            ? { backgroundColor: '#002045', color: '#ffffff' }
                            : { color: '#43474e' }
                        }
                      >
                        {option.label}
                      </Link>
                    )
                  })}
                </div>
              </div>

              {/* Tags */}
              <div>
                <p
                  className="mb-3 text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: '#74777f' }}
                >
                  Popular Tags
                </p>
                <div className="flex flex-wrap gap-2">
                  {tags.map((option) => {
                    const active = option.label === tag
                    return (
                      <Link
                        key={option.slug}
                        href={createUrlWithFilters({
                          page: 1,
                          placeType,
                          query,
                          sort,
                          tag: active ? '' : option.label,
                        })}
                        className="rounded-full border px-3 py-1 text-xs font-medium transition"
                        style={
                          active
                            ? { borderColor: '#b52426', backgroundColor: '#b52426', color: '#ffffff' }
                            : { borderColor: '#c4c6cf', color: '#43474e' }
                        }
                      >
                        {option.label}
                      </Link>
                    )
                  })}
                </div>
              </div>

              {/* Sort */}
              <div>
                <p
                  className="mb-3 text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: '#74777f' }}
                >
                  Sort By
                </p>
                <div className="space-y-1">
                  {(
                    [
                      { value: 'newest', label: 'Newest uploads' },
                      { value: 'oldest', label: 'Oldest uploads' },
                      { value: 'captured', label: 'Latest capture date' },
                    ] as { value: AlbumsMarketplaceSort; label: string }[]
                  ).map(({ value, label }) => {
                    const active = value === sort
                    return (
                      <Link
                        key={value}
                        href={createUrlWithFilters({ page: 1, placeType, query, sort: value, tag })}
                        className="block rounded-lg px-3 py-2 text-sm font-medium transition"
                        style={
                          active
                            ? { backgroundColor: '#f0f3ff', color: '#002045', fontWeight: 600 }
                            : { color: '#43474e' }
                        }
                      >
                        {label}
                      </Link>
                    )
                  })}
                </div>
              </div>

              {/* Clear all */}
              <Link
                href="/"
                className="block text-center text-sm font-medium transition hover:opacity-70"
                style={{ color: '#b52426' }}
              >
                Clear all filters
              </Link>
            </div>
          </aside>

          {/* Content */}
          <div className="min-w-0 flex-1 space-y-6">

            {/* Results header + active chips */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm" style={{ color: '#43474e' }}>
                <span className="font-semibold" style={{ color: '#121c2c' }}>
                  {totalCount.toLocaleString('en-US')}
                </span>{' '}
                photos — page {page} of {totalPages}
              </p>
              <div className="flex flex-wrap gap-2">
                {query && (
                  <Link
                    href={createUrlWithFilters({ page: 1, placeType, query: '', sort, tag })}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition hover:opacity-70"
                    style={{ borderColor: '#c4c6cf', color: '#43474e' }}
                  >
                    &ldquo;{query}&rdquo; ×
                  </Link>
                )}
                {placeType && (
                  <Link
                    href={createUrlWithFilters({ page: 1, placeType: '', query, sort, tag })}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition hover:opacity-70"
                    style={{ borderColor: '#c4c6cf', color: '#43474e' }}
                  >
                    {placeType} ×
                  </Link>
                )}
                {tag && (
                  <Link
                    href={createUrlWithFilters({ page: 1, placeType, query, sort, tag: '' })}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition hover:opacity-70"
                    style={{ borderColor: '#b52426', color: '#b52426' }}
                  >
                    {tag} ×
                  </Link>
                )}
              </div>
            </div>

            {/* Photo grid */}
            <PhotoWall photos={photos} />

            {/* Pagination */}
            {totalPages > 1 && (
              <nav
                className="mt-8 flex flex-wrap items-center justify-center gap-2"
                aria-label="Pagination"
              >
                <Link
                  href={createPageHref(Math.max(1, safePage - 1))}
                  aria-disabled={safePage <= 1}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm transition hover:opacity-70 aria-disabled:pointer-events-none aria-disabled:opacity-30"
                  style={{ borderColor: '#c4c6cf', color: '#002045' }}
                >
                  ‹
                </Link>

                {pagesToShow.map((pageNumber) => (
                  <Link
                    key={pageNumber}
                    href={createPageHref(pageNumber)}
                    aria-current={pageNumber === safePage ? 'page' : undefined}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition"
                    style={
                      pageNumber === safePage
                        ? { backgroundColor: '#002045', borderColor: '#002045', color: '#ffffff' }
                        : { borderColor: '#c4c6cf', color: '#002045' }
                    }
                  >
                    {pageNumber}
                  </Link>
                ))}

                <Link
                  href={createPageHref(Math.min(totalPages, safePage + 1))}
                  aria-disabled={safePage >= totalPages}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm transition hover:opacity-70 aria-disabled:pointer-events-none aria-disabled:opacity-30"
                  style={{ borderColor: '#c4c6cf', color: '#002045' }}
                >
                  ›
                </Link>
              </nav>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="mt-20" style={{ backgroundColor: '#002045' }}>
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-12 px-8 py-16 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/Homes%20Drive%20Logo%20White.png"
                alt="Homes.ph Drive"
                className="h-9 w-auto object-contain"
              />
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
              A curated marketplace for real estate photography across the Philippines and beyond.
            </p>
          </div>

          {/* Platform */}
          <div>
            <p
              className="mb-4 text-xs font-semibold uppercase tracking-[0.18em]"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              Platform
            </p>
            <ul className="space-y-2">
              {['Browse Marketplace', 'Collections', 'Latest Uploads', 'Featured Work'].map((item) => (
                <li key={item}>
                  <span
                    className="text-sm transition-opacity cursor-pointer hover:opacity-80"
                    style={{ color: 'rgba(255,255,255,0.75)' }}
                  >
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <p
              className="mb-4 text-xs font-semibold uppercase tracking-[0.18em]"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              Company
            </p>
            <ul className="space-y-2">
              {['About Us', 'For Contributors', 'Privacy Policy', 'Terms of Service'].map((item) => (
                <li key={item}>
                  <span
                    className="text-sm transition-opacity cursor-pointer hover:opacity-80"
                    style={{ color: 'rgba(255,255,255,0.75)' }}
                  >
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <p
              className="mb-4 text-xs font-semibold uppercase tracking-[0.18em]"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              Stay Updated
            </p>
            <p className="mb-4 text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>
              Get notified when new collections are published.
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="you@example.com"
                className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.2)' }}
              />
              <button
                type="button"
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ backgroundColor: '#b52426' }}
              >
                Join
              </button>
            </div>
          </div>
        </div>

        <div
          className="border-t px-8 py-6 text-center text-xs"
          style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}
        >
          © {new Date().getFullYear()} homes.ph · Leuterio Realty · All rights reserved
        </div>
      </footer>
    </div>
  )
}
