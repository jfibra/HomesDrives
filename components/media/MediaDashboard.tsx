'use client'

import {
  ArrowRight,
  ArrowUpRight,
  CloudUpload,
  Folder,
  FolderOpen,
  IdCard,
  ImageIcon,
  MapIcon,
  MapPin,
  Share2,
} from 'lucide-react'

import { cn } from '@/lib/utils'

type MediaDashboardPhoto = {
  id: string
  image_url: string
  original_file_name: string
  place_name: string | null
}

export type MediaDashboardProps = {
  allFoldersCount: number
  avatarUrl?: string | null
  fullName: string
  areaFocused: string
  geotaggedCount: number
  initials: string
  myFoldersCount: number
  onAllFolders: () => void
  onMapView: () => void
  onMyFolders: () => void
  onMyPhotos: () => void
  onNewUpload: () => void
  onPublicProfile: () => void
  onUploadStudio: () => void
  onViewId: () => void
  photosCount: number
  recentPhotos: MediaDashboardPhoto[]
  storageLabel: string
}

function StatCard({
  accent,
  icon,
  label,
  sublabel,
  value,
}: {
  accent: string
  icon: React.ReactNode
  label: string
  sublabel?: string
  value: string
}) {
  return (
    <div
      className="group relative overflow-hidden rounded-[1.35rem] border p-5 transition duration-300 hover:-translate-y-0.5 hover:shadow-lg"
      style={{
        backgroundColor: 'var(--ds-surface-container-lowest)',
        borderColor: 'rgba(196,198,207,0.45)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.12] blur-2xl transition group-hover:opacity-20"
        style={{ backgroundColor: accent }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--ds-on-surface-variant)' }}>
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight" style={{ color: 'var(--ds-primary)' }}>
            {value}
          </p>
          {sublabel ? (
            <p className="mt-1 text-xs" style={{ color: 'var(--ds-outline)' }}>
              {sublabel}
            </p>
          ) : null}
        </div>
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
          style={{ backgroundColor: accent }}
        >
          {icon}
        </div>
      </div>
    </div>
  )
}

function ActionCard({
  accent,
  description,
  icon,
  onClick,
  title,
}: {
  accent: string
  description: string
  icon: React.ReactNode
  onClick: () => void
  title: string
}) {
  return (
    <button
      className="group flex h-full flex-col rounded-[1.35rem] border p-5 text-left transition duration-300 hover:-translate-y-0.5 hover:shadow-lg"
      onClick={onClick}
      style={{
        backgroundColor: 'var(--ds-surface-container-lowest)',
        borderColor: 'rgba(196,198,207,0.45)',
      }}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-md"
          style={{ backgroundColor: accent }}
        >
          {icon}
        </div>
        <ArrowUpRight
          className="h-5 w-5 opacity-0 transition group-hover:opacity-100"
          style={{ color: 'var(--ds-primary)' }}
        />
      </div>
      <p className="mt-5 text-base font-semibold" style={{ color: 'var(--ds-on-surface)' }}>
        {title}
      </p>
      <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--ds-on-surface-variant)' }}>
        {description}
      </p>
    </button>
  )
}

export default function MediaDashboard({
  allFoldersCount,
  avatarUrl,
  fullName,
  areaFocused,
  geotaggedCount,
  initials,
  myFoldersCount,
  onAllFolders,
  onMapView,
  onMyFolders,
  onMyPhotos,
  onNewUpload,
  onPublicProfile,
  onUploadStudio,
  onViewId,
  photosCount,
  recentPhotos,
  storageLabel,
}: MediaDashboardProps) {
  const firstName = fullName.split(/\s+/)[0] ?? fullName

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-[2rem] border p-6 sm:p-8 lg:p-10"
        style={{
          borderColor: 'rgba(255,255,255,0.35)',
          backgroundColor: '#1428AE',
          boxShadow: '0 28px 80px rgba(0,32,69,0.22)',
        }}
      >
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={fullName}
                className="h-20 w-20 shrink-0 rounded-[1.35rem] border-4 border-white/80 object-cover shadow-xl sm:h-24 sm:w-24"
                src={avatarUrl}
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.35rem] border-4 border-white/80 bg-white/15 text-2xl font-bold text-white shadow-xl sm:h-24 sm:w-24">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-headline text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Welcome back, {firstName}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/80 sm:text-base">
                Your workspace for uploads, folders, public profile, and media ID — everything in one place.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 text-sm text-white/85">
                <MapPin className="h-4 w-4 shrink-0 text-[#ffe9a2]" />
                <span>{areaFocused}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-sm font-semibold shadow-lg transition hover:bg-white/95"
              onClick={onNewUpload}
              style={{ color: 'var(--ds-primary)' }}
              type="button"
            >
              <CloudUpload className="h-4 w-4" />
              New upload
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-5 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15"
              onClick={onPublicProfile}
              type="button"
            >
              <Share2 className="h-4 w-4" />
              Public profile
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          accent="#002143"
          icon={<FolderOpen className="h-5 w-5" />}
          label="My folders"
          sublabel="Active projects"
          value={String(myFoldersCount)}
        />
        <StatCard
          accent="#1428ae"
          icon={<Folder className="h-5 w-5" />}
          label="All folders"
          sublabel="Across Homes.ph"
          value={String(allFoldersCount)}
        />
        <StatCard
          accent="#c6603d"
          icon={<ImageIcon className="h-5 w-5" />}
          label="My photos"
          sublabel={`${geotaggedCount} with location`}
          value={String(photosCount)}
        />
        <StatCard
          accent="#0f766e"
          icon={<MapPin className="h-5 w-5" />}
          label="Storage used"
          sublabel="High-quality JPEG"
          value={storageLabel}
        />
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Quick actions */}
        <div>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold" style={{ color: 'var(--ds-on-surface)' }}>
                Quick actions
              </h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
                Jump straight into your most-used tools
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ActionCard
              accent="var(--ds-primary)"
              description="Open Upload Studio and add photos to a folder."
              icon={<CloudUpload className="h-6 w-6" />}
              onClick={onUploadStudio}
              title="Upload Studio"
            />
            <ActionCard
              accent="var(--ds-secondary)"
              description="Share your client-facing Homes.ph profile and forms."
              icon={<Share2 className="h-6 w-6" />}
              onClick={onPublicProfile}
              title="Public profile"
            />
            <ActionCard
              accent="#1428ae"
              description="View, preview, and download your official media ID."
              icon={<IdCard className="h-6 w-6" />}
              onClick={onViewId}
              title="View my ID"
            />
            <ActionCard
              accent="#c6603d"
              description="Browse, filter, and manage your full photo library."
              icon={<ImageIcon className="h-6 w-6" />}
              onClick={onMyPhotos}
              title="My photos"
            />
          </div>
        </div>

        {/* Workspace + recent */}
        <div className="flex flex-col gap-6">
          <div
            className="rounded-[1.35rem] border p-5"
            style={{
              backgroundColor: 'var(--ds-surface-container-lowest)',
              borderColor: 'rgba(196,198,207,0.45)',
            }}
          >
            <h2 className="text-lg font-semibold" style={{ color: 'var(--ds-on-surface)' }}>
              Workspace
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
              Navigate your folders and map
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {[
                { label: 'My folders', onClick: onMyFolders, icon: FolderOpen },
                { label: 'All folders', onClick: onAllFolders, icon: Folder },
                { label: 'Map view', onClick: onMapView, icon: MapIcon },
              ].map(({ label, onClick, icon: Icon }) => (
                <button
                  className="flex items-center justify-between rounded-xl border px-4 py-3 text-left transition hover:bg-white"
                  key={label}
                  onClick={onClick}
                  style={{
                    borderColor: 'rgba(196,198,207,0.35)',
                    backgroundColor: 'var(--ds-surface-container)',
                  }}
                  type="button"
                >
                  <span className="flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-xl"
                      style={{
                        backgroundColor: 'var(--ds-surface-container-lowest)',
                        color: 'var(--ds-primary)',
                      }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--ds-on-surface)' }}>
                      {label}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4" style={{ color: 'var(--ds-outline)' }} />
                </button>
              ))}
            </div>
          </div>

          <div
            className="rounded-[1.35rem] border p-5"
            style={{
              backgroundColor: 'var(--ds-surface-container-lowest)',
              borderColor: 'rgba(196,198,207,0.45)',
            }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--ds-on-surface)' }}>
                  Recent uploads
                </h2>
                <p className="mt-1 text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
                  Latest from your library
                </p>
              </div>
              {photosCount > 0 ? (
                <button
                  className="text-sm font-semibold"
                  onClick={onMyPhotos}
                  style={{ color: 'var(--ds-primary)' }}
                  type="button"
                >
                  View all
                </button>
              ) : null}
            </div>

            {recentPhotos.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {recentPhotos.slice(0, 4).map((photo, index) => (
                  <div
                    className={cn(
                      'group relative overflow-hidden rounded-2xl bg-slate-100',
                      index === 0 ? 'col-span-2 aspect-[16/10]' : 'aspect-square',
                    )}
                    key={photo.id}
                  >
                    {photo.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={photo.original_file_name}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                        src={photo.image_url}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImageIcon className="h-8 w-8 text-slate-400" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                      <p className="truncate text-xs font-medium text-white">
                        {photo.place_name || photo.original_file_name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center"
                style={{ borderColor: 'rgba(196,198,207,0.55)' }}
              >
                <ImageIcon className="h-10 w-10" style={{ color: 'var(--ds-outline)' }} />
                <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--ds-on-surface)' }}>
                  No uploads yet
                </p>
                <p className="mt-1 text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
                  Start by creating a folder and uploading your first photos.
                </p>
                <button
                  className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
                  onClick={onNewUpload}
                  style={{ backgroundColor: 'var(--ds-primary)' }}
                  type="button"
                >
                  <CloudUpload className="h-4 w-4" />
                  Upload now
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
