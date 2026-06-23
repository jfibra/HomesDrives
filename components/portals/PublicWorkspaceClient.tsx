'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderTree as FolderTreeIcon,
  ImageIcon,
  PanelLeft,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'

import FolderTree from '@/components/portals/FolderTree'
import PortalFrame from '@/components/portals/PortalFrame'
import { filterPortalPhotosByFileName } from '@/lib/portals/filter-photos'
import { withEventQuery } from '@/lib/portals/event-query'
import type { PortalEvent, PortalFolder, PortalFolderNode, PortalPhotoPreview } from '@/lib/portals/types'

function isVideoFileName(name: string) {
  return /\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(name)
}

function sanitizeDownloadFileName(input: string) {
  return (input || 'download').replace(/[<>:"/\\|?*]/g, '').trim() || 'download'
}

function PublicPhotoThumbnail({
  onOpen,
  photo,
}: {
  onOpen: (photo: PortalPhotoPreview) => void
  photo: PortalPhotoPreview
}) {
  const [failed, setFailed] = useState(false)

  if (failed || !photo.image_url) {
    return (
      <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-slate-100 text-slate-400">
        <ImageIcon className="h-6 w-6" />
        <span className="px-2 text-center text-xs">Preview unavailable</span>
      </div>
    )
  }

  return (
    <button
      aria-label={`Open ${photo.original_file_name}`}
      className="group block aspect-[4/3] w-full cursor-zoom-in overflow-hidden border-0 bg-slate-100 p-0"
      onClick={() => onOpen(photo)}
      type="button"
    >
      {isVideoFileName(photo.original_file_name) ? (
        <video
          className="h-full w-full object-contain object-top transition duration-200 group-hover:scale-[1.02]"
          muted
          onError={() => setFailed(true)}
          playsInline
          preload="metadata"
          src={photo.image_url}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={photo.original_file_name}
          className="h-full w-full object-contain object-top transition duration-200 group-hover:scale-[1.02]"
          key={photo.image_url}
          onError={() => setFailed(true)}
          src={photo.image_url}
        />
      )}
    </button>
  )
}

export default function PublicWorkspaceClient({ eventSlug }: { eventSlug: string }) {
  const searchParams = useSearchParams()
  const folderIdFromUrl = searchParams.get('folder')
  const isSharedFolderView = Boolean(folderIdFromUrl)
  const [eventInfo, setEventInfo] = useState<PortalEvent | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [photosLoading, setPhotosLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [folders, setFolders] = useState<PortalFolder[]>([])
  const [tree, setTree] = useState<PortalFolderNode[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [folderSearch, setFolderSearch] = useState('')
  const [photoSearch, setPhotoSearch] = useState('')
  const [photos, setPhotos] = useState<PortalPhotoPreview[]>([])
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [foldersPanelOpen, setFoldersPanelOpen] = useState(false)
  const [downloadingPhotoId, setDownloadingPhotoId] = useState<string | null>(null)

  const selectedFolder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  )

  const filteredPhotos = useMemo(
    () => filterPortalPhotosByFileName(photos, photoSearch),
    [photos, photoSearch],
  )

  const currentLightboxPhoto =
    lightboxIndex != null ? filteredPhotos[lightboxIndex] ?? null : null

  const loadSharedFolder = useCallback(async (folderId: string) => {
    setError('')
    setLoading(true)
    setPhotosLoading(true)
    try {
      const res = await fetch(
        withEventQuery(`/api/portal-api/public/folders/${folderId}/photos`, eventSlug),
      )
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Unable to load folder.')
      setEventInfo(data.event ?? null)
      const folder = data?.folder as PortalFolder | undefined
      if (!folder?.id) throw new Error('Folder not found.')
      setFolders([folder])
      setTree([])
      setSelectedFolderId(folder.id)
      setPhotos(Array.isArray(data.photos) ? data.photos : [])
      setLightboxIndex(null)
    } catch (e) {
      setFolders([])
      setTree([])
      setSelectedFolderId(null)
      setPhotos([])
      setError(e instanceof Error ? e.message : 'Unable to load folder.')
    } finally {
      setLoading(false)
      setPhotosLoading(false)
    }
  }, [eventSlug])

  const loadFolders = useCallback(async () => {
    if (folderIdFromUrl) {
      await loadSharedFolder(folderIdFromUrl)
      return
    }

    setError('')
    setLoading(true)
    try {
      const res = await fetch(withEventQuery('/api/portal-api/public/folders', eventSlug))
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Unable to load folders.')
      setEventInfo(data.event ?? null)
      const nextFolders = Array.isArray(data.folders) ? data.folders : []
      setFolders(nextFolders)
      setTree(Array.isArray(data.tree) ? data.tree : [])
      setSelectedFolderId((current) => {
        if (current && nextFolders.some((folder) => folder.id === current)) {
          return current
        }
        return nextFolders[0]?.id ?? null
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load folders.')
    } finally {
      setLoading(false)
    }
  }, [eventSlug, folderIdFromUrl, loadSharedFolder])

  const loadPhotos = useCallback(async (folderId: string) => {
    setPhotosLoading(true)
    try {
      const res = await fetch(
        withEventQuery(`/api/portal-api/public/folders/${folderId}/photos`, eventSlug),
      )
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Unable to load photos.')
      setPhotos(Array.isArray(data.photos) ? data.photos : [])
      setLightboxIndex(null)
    } catch (e) {
      setPhotos([])
      setError(e instanceof Error ? e.message : 'Unable to load photos.')
    } finally {
      setPhotosLoading(false)
    }
  }, [eventSlug])

  useEffect(() => {
    void loadFolders()
  }, [loadFolders])

  useEffect(() => {
    setPhotoSearch('')
  }, [selectedFolderId])

  useEffect(() => {
    if (isSharedFolderView || !selectedFolderId) {
      if (!isSharedFolderView) {
        setPhotos([])
        setLightboxIndex(null)
      }
      return
    }
    void loadPhotos(selectedFolderId)
  }, [selectedFolderId, loadPhotos, isSharedFolderView])

  useEffect(() => {
    if (lightboxIndex == null) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setLightboxIndex(null)
        return
      }
      if (filteredPhotos.length <= 1) return
      if (event.key === 'ArrowLeft') {
        setLightboxIndex((current) => {
          if (current == null) return current
          return (current - 1 + filteredPhotos.length) % filteredPhotos.length
        })
      }
      if (event.key === 'ArrowRight') {
        setLightboxIndex((current) => {
          if (current == null) return current
          return (current + 1) % filteredPhotos.length
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxIndex, filteredPhotos.length])

  useEffect(() => {
    if (lightboxIndex == null) return
    if (filteredPhotos.length === 0) {
      setLightboxIndex(null)
      return
    }
    if (lightboxIndex >= filteredPhotos.length) {
      setLightboxIndex(filteredPhotos.length - 1)
    }
  }, [filteredPhotos.length, lightboxIndex])

  const filteredTree = useMemo(() => {
    const q = folderSearch.trim().toLowerCase()
    if (!q) return tree

    const filterNodes = (nodes: PortalFolderNode[]): PortalFolderNode[] => {
      const results: PortalFolderNode[] = []
      for (const node of nodes) {
        const selfMatch = node.folder_name.toLowerCase().includes(q)
        const children = node.children.length ? filterNodes(node.children) : []
        if (selfMatch || children.length) results.push({ ...node, children })
      }
      return results
    }

    return filterNodes(tree)
  }, [folderSearch, tree])

  function handleFolderSelect(id: string) {
    setSelectedFolderId(id)
    setFoldersPanelOpen(false)
  }

  function openLightbox(photo: PortalPhotoPreview) {
    const index = filteredPhotos.findIndex((item) => item.id === photo.id)
    setLightboxIndex(index >= 0 ? index : 0)
  }

  function closeLightbox() {
    setLightboxIndex(null)
  }

  function showPreviousLightboxPhoto() {
    setLightboxIndex((current) => {
      if (current == null || filteredPhotos.length === 0) return current
      return (current - 1 + filteredPhotos.length) % filteredPhotos.length
    })
  }

  function showNextLightboxPhoto() {
    setLightboxIndex((current) => {
      if (current == null || filteredPhotos.length === 0) return current
      return (current + 1) % filteredPhotos.length
    })
  }

  async function downloadPhoto(photo: PortalPhotoPreview) {
    if (!photo.image_url) return
    setError('')
    setDownloadingPhotoId(photo.id)
    try {
      const res = await fetch(
        withEventQuery(`/api/portal-api/public/photos/${photo.id}/download`, eventSlug),
      )
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Unable to download file.')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = sanitizeDownloadFileName(photo.original_file_name)
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to download file.')
    } finally {
      setDownloadingPhotoId(null)
    }
  }

  async function downloadSelectedFolder() {
    if (!selectedFolderId) return
    setError('')
    setDownloading(true)
    try {
      const res = await fetch(
        withEventQuery(`/api/portal-api/public/folders/${selectedFolderId}/download`, eventSlug),
      )
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Unable to download zip.')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const name = (selectedFolder?.folder_name?.trim() || 'folder').replace(/[<>:"/\\|?*]/g, '')
      a.href = url
      a.download = `${name}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to download zip.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <PortalFrame
      badge="Public Download"
      subtitle={eventInfo ? `Downloads for ${eventInfo.name}.` : undefined}
      title={eventInfo?.name ?? 'Public download'}
      variant="public"
    >
      {error ? (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50/90 px-4 py-3 text-sm text-red-700 shadow-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="leading-relaxed">{error}</p>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/75 shadow-[0_20px_60px_-12px_rgba(16,35,63,0.12)] backdrop-blur-sm">
        <div className={isSharedFolderView ? '' : 'grid lg:grid-cols-[300px_minmax(0,1fr)]'}>
          {!isSharedFolderView ? (
          <aside
            className={`border-b border-slate-100/80 bg-gradient-to-b from-[#f5f9ff] to-white p-4 sm:p-5 lg:border-b-0 lg:border-r ${
              foldersPanelOpen ? 'block' : 'hidden lg:block'
            }`}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[#10233f]">Folders</h2>
                <p className="text-xs text-slate-500">Select a folder to preview</p>
              </div>
              <button
                aria-label="Refresh folders"
                className="rounded-xl border border-slate-200/80 bg-white p-2.5 text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-[#10233f]"
                disabled={loading}
                onClick={() => void loadFolders()}
                type="button"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                onChange={(e) => setFolderSearch(e.target.value)}
                placeholder="Search folders..."
                type="search"
                value={folderSearch}
              />
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((item) => (
                  <div className="h-10 animate-pulse rounded-xl bg-slate-100" key={item} />
                ))}
              </div>
            ) : filteredTree.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-8 text-center">
                <FolderTreeIcon className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                <p className="text-sm text-slate-500">
                  {folderSearch.trim() ? 'No folders match your search.' : 'No folders available yet.'}
                </p>
              </div>
            ) : (
              <FolderTree
                nodes={filteredTree}
                onSelect={handleFolderSelect}
                selectedId={selectedFolderId}
              />
            )}
          </aside>
          ) : null}

          <div className="min-h-[420px] bg-gradient-to-br from-white via-white to-slate-50/60 p-4 sm:min-h-[520px] sm:p-6 lg:p-8">
            {!isSharedFolderView ? (
            <button
              className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-[#10233f] shadow-sm transition hover:bg-slate-50 lg:hidden"
              onClick={() => setFoldersPanelOpen((open) => !open)}
              type="button"
            >
              <PanelLeft className="h-4 w-4" />
              {foldersPanelOpen ? 'Hide folders' : 'Browse folders'}
              {selectedFolder ? (
                <span className="truncate text-slate-500">· {selectedFolder.folder_name}</span>
              ) : null}
            </button>
            ) : null}

            {loading ? (
              <div className="space-y-5">
                <div className="space-y-2 border-b border-slate-100 pb-5">
                  <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
                  <div className="h-8 w-48 animate-pulse rounded bg-slate-100" />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {[1, 2, 3, 4, 5, 6].map((item) => (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" key={item}>
                      <div className="aspect-[4/3] animate-pulse bg-slate-100" />
                      <div className="space-y-2 p-2.5">
                        <div className="h-3 animate-pulse rounded bg-slate-100" />
                        <div className="h-2.5 w-2/3 animate-pulse rounded bg-slate-100" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : !selectedFolder ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/80 bg-white/60 px-6 py-12 text-center sm:min-h-[360px]">
                <FolderTreeIcon className="mb-3 h-10 w-10 text-slate-300" />
                <p className="text-base font-medium text-[#10233f]">
                  {isSharedFolderView ? 'Shared folder unavailable' : 'Select a folder'}
                </p>
                <p className="mt-1 max-w-sm text-sm text-slate-500">
                  {isSharedFolderView
                    ? 'This link may be invalid or the folder may have been removed.'
                    : 'Choose a folder from the sidebar to preview photos and videos before downloading.'}
                </p>
                {!isSharedFolderView ? (
                <button
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 lg:hidden"
                  onClick={() => setFoldersPanelOpen(true)}
                  type="button"
                >
                  <PanelLeft className="h-4 w-4" />
                  Browse folders
                </button>
                ) : null}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {isSharedFolderView ? 'Shared folder' : 'Selected folder'}
                    </p>
                    <h2 className="mt-1 truncate text-xl font-semibold text-[#10233f] sm:text-2xl">
                      {selectedFolder.folder_name}
                    </h2>
                  </div>
                  <button
                    className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    disabled={downloading || photos.length === 0}
                    onClick={() => void downloadSelectedFolder()}
                    type="button"
                  >
                    <Download className="h-4 w-4" />
                    {downloading ? 'Preparing ZIP…' : 'Download ZIP'}
                  </button>
                </div>

                {photosLoading ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {[1, 2, 3, 4, 5, 6].map((item) => (
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" key={item}>
                        <div className="aspect-[4/3] animate-pulse bg-slate-100" />
                        <div className="space-y-2 p-2.5">
                          <div className="h-3 animate-pulse rounded bg-slate-100" />
                          <div className="h-2.5 w-2/3 animate-pulse rounded bg-slate-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : photos.length === 0 ? (
                  <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center text-slate-500">
                    <ImageIcon className="mb-2 h-8 w-8 opacity-40" />
                    <p className="text-sm font-medium text-slate-600">No media in this folder yet</p>
                    <p className="mt-1 text-xs text-slate-400">Check back once uploads are complete.</p>
                  </div>
                ) : (
                  <div>
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-sm font-semibold text-[#10233f]">Media preview</h3>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                        {photoSearch.trim()
                          ? `${filteredPhotos.length} of ${photos.length}`
                          : `${photos.length} item${photos.length === 1 ? '' : 's'}`}
                      </span>
                    </div>
                    <div className="relative mb-4">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                        onChange={(e) => setPhotoSearch(e.target.value)}
                        placeholder="Search photos and videos by file name..."
                        type="search"
                        value={photoSearch}
                      />
                    </div>
                    {filteredPhotos.length === 0 ? (
                      <div className="flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center text-slate-500">
                        <Search className="mb-2 h-7 w-7 opacity-40" />
                        <p className="text-sm font-medium text-slate-600">No files match your search</p>
                        <p className="mt-1 text-xs text-slate-400">Try a different file name.</p>
                      </div>
                    ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {filteredPhotos.map((photo) => (
                        <article
                          className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm transition hover:shadow-md"
                          key={photo.id}
                        >
                          <PublicPhotoThumbnail onOpen={openLightbox} photo={photo} />
                          <div className="space-y-2 px-2.5 py-2">
                            <div className="space-y-0.5">
                              <p className="truncate text-xs font-medium text-slate-700">
                                {photo.original_file_name}
                              </p>
                              {photo.subfolder_name ? (
                                <p className="truncate text-[11px] text-slate-400">{photo.subfolder_name}</p>
                              ) : null}
                            </div>
                            <button
                              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-[#10233f] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={!photo.image_url || downloadingPhotoId === photo.id}
                              onClick={() => void downloadPhoto(photo)}
                              type="button"
                            >
                              <Download className="h-3.5 w-3.5" />
                              {downloadingPhotoId === photo.id ? 'Downloading…' : 'Download'}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {currentLightboxPhoto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#10233f]/90 px-3 backdrop-blur-sm sm:px-4"
          onClick={closeLightbox}
        >
          <button
            aria-label="Close photo preview"
            className="absolute right-3 top-3 z-20 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20 sm:right-4 sm:top-4"
            onClick={closeLightbox}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>

          {filteredPhotos.length > 1 ? (
            <>
              <button
                aria-label="Previous photo"
                className="absolute left-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:left-4 sm:h-11 sm:w-11"
                onClick={(e) => {
                  e.stopPropagation()
                  showPreviousLightboxPhoto()
                }}
                type="button"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                aria-label="Next photo"
                className="absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:right-4 sm:h-11 sm:w-11"
                onClick={(e) => {
                  e.stopPropagation()
                  showNextLightboxPhoto()
                }}
                type="button"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          ) : null}

          <div className="max-w-5xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex flex-col items-center justify-center gap-2 px-2">
              <p className="max-w-[90vw] truncate text-sm font-medium text-white sm:max-w-none">
                {currentLightboxPhoto.original_file_name}
              </p>
              {currentLightboxPhoto.subfolder_name ? (
                <p className="text-xs text-white/70">{currentLightboxPhoto.subfolder_name}</p>
              ) : null}
              {filteredPhotos.length > 1 ? (
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/80">
                  {(lightboxIndex ?? 0) + 1} / {filteredPhotos.length}
                </span>
              ) : null}
              <button
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20 disabled:opacity-60"
                disabled={!currentLightboxPhoto.image_url || downloadingPhotoId === currentLightboxPhoto.id}
                onClick={() => void downloadPhoto(currentLightboxPhoto)}
                type="button"
              >
                <Download className="h-4 w-4" />
                {downloadingPhotoId === currentLightboxPhoto.id ? 'Downloading…' : 'Download'}
              </button>
            </div>
            {isVideoFileName(currentLightboxPhoto.original_file_name) ? (
              <video
                controls
                className="max-h-[70vh] w-auto max-w-[calc(100vw-2rem)] rounded-lg object-contain shadow-2xl sm:max-h-[80vh] sm:max-w-full"
                key={currentLightboxPhoto.id}
                src={currentLightboxPhoto.image_url}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={currentLightboxPhoto.original_file_name}
                className="max-h-[70vh] w-auto max-w-[calc(100vw-2rem)] rounded-lg object-contain shadow-2xl sm:max-h-[80vh] sm:max-w-full"
                key={currentLightboxPhoto.id}
                src={currentLightboxPhoto.image_url}
              />
            )}
          </div>
        </div>
      ) : null}
    </PortalFrame>
  )
}
