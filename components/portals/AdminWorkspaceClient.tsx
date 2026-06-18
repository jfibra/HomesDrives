'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronLeft, ChevronRight, Folder, ImageIcon, PanelLeft, Pencil, RefreshCw, Settings2, Trash2, Upload, X, AlertCircle, CheckCircle2 } from 'lucide-react'

import FolderTree from '@/components/portals/FolderTree'
import PortalFrame from '@/components/portals/PortalFrame'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getSubFolderCardColorByIndex } from '@/components/portals/sub-folder-card-colors'
import { Switch } from '@/components/ui/switch'
import { PHOTOGRAPHER_PORTAL_CODE, PORTAL_ADMIN_SESSION_KEY } from '@/lib/portals/constants'
import type { PortalFolder, PortalFolderNode, PortalPhoto } from '@/lib/portals/types'
import { sortPortalPhotosByFileName } from '@/lib/portals/sort-photos'

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function isPortalPhoto(value: unknown): value is PortalPhoto {
  if (!value || typeof value !== 'object') return false
  const photo = value as PortalPhoto
  return (
    typeof photo.id === 'string' &&
    typeof photo.image_url === 'string' &&
    typeof photo.original_file_name === 'string'
  )
}

function isVideoFileName(name: string) {
  return /\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(name)
}

function PortalPhotoThumbnail({
  onOpen,
  photo,
}: {
  onOpen: (photo: PortalPhoto) => void
  photo: PortalPhoto
}) {
  const [failed, setFailed] = useState(false)

  if (failed || !photo.image_url) {
    return (
      <div className="flex aspect-[5/4] w-full flex-col items-center justify-center gap-2 bg-slate-100 text-slate-400">
        <ImageIcon className="h-8 w-8" />
        <span className="px-3 text-center text-xs">Preview unavailable</span>
      </div>
    )
  }

  return (
    <button
      aria-label={`Open ${photo.original_file_name}`}
      className="group block aspect-[5/4] w-full cursor-zoom-in overflow-hidden border-0 bg-slate-100 p-0"
      onClick={() => onOpen(photo)}
      type="button"
    >
      {isVideoFileName(photo.original_file_name) ? (
        <video
          className="h-full w-full object-contain object-top transition duration-200 group-hover:scale-[1.02]"
          src={photo.image_url}
          preload="metadata"
          muted
          playsInline
          onError={() => setFailed(true)}
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

export default function AdminWorkspaceClient() {
  const router = useRouter()
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const [adminCode, setAdminCode] = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem(PORTAL_ADMIN_SESSION_KEY) ?? ''
  })
  const [folderSearch, setFolderSearch] = useState('')
  const [tree, setTree] = useState<PortalFolderNode[]>([])
  const [folders, setFolders] = useState<PortalFolder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [photos, setPhotos] = useState<PortalPhoto[]>([])
  const [folderNameDraft, setFolderNameDraft] = useState('')
  const [folderPublicVisibleDraft, setFolderPublicVisibleDraft] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(true)
  const [photosLoading, setPhotosLoading] = useState(false)
  const [renamingPhotoId, setRenamingPhotoId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [savingRenamePhotoId, setSavingRenamePhotoId] = useState<string | null>(null)
  const [confirmDeletePhotoId, setConfirmDeletePhotoId] = useState<string | null>(null)
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null)
  const [replacingPhotoId, setReplacingPhotoId] = useState<string | null>(null)
  const [replaceTargetPhotoId, setReplaceTargetPhotoId] = useState<string | null>(null)
  const [deletingFolder, setDeletingFolder] = useState(false)
  const [folderManageOpen, setFolderManageOpen] = useState(false)
  const [folderManageDeleteConfirm, setFolderManageDeleteConfirm] = useState(false)
  const [isSavingFolderName, setIsSavingFolderName] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [foldersPanelOpen, setFoldersPanelOpen] = useState(false)

  const selectedFolder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  )

  const childFolders = useMemo(() => {
    if (!selectedFolderId) return []
    return folders
      .filter((folder) => folder.parent_folder_id === selectedFolderId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [folders, selectedFolderId])

  const hasChildFolders = childFolders.length > 0

  const currentLightboxPhoto = lightboxIndex != null ? photos[lightboxIndex] ?? null : null

  const loadFolders = useCallback(async (code: string) => {
    const res = await fetch(`/api/portals/admin/folders?adminCode=${encodeURIComponent(code)}`)
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error || 'Unable to load folders.')
    setFolders(Array.isArray(data.folders) ? data.folders : [])
    setTree(Array.isArray(data.tree) ? data.tree : [])
  }, [])

  const filteredTree = useMemo(() => {
    const q = folderSearch.trim().toLowerCase()
    if (!q) return tree

    const filterNodes = (nodes: PortalFolderNode[]): PortalFolderNode[] => {
      const results: PortalFolderNode[] = []
      for (const node of nodes) {
        const selfMatch =
          node.folder_name.toLowerCase().includes(q) || node.uploader_code.toLowerCase().includes(q)
        const children = node.children.length ? filterNodes(node.children) : []
        if (selfMatch || children.length) {
          results.push({ ...node, children })
        }
      }
      return results
    }

    return filterNodes(tree)
  }, [folderSearch, tree])

  const loadPhotos = useCallback(async (code: string, folderId: string, showLoading = true) => {
    if (showLoading) setPhotosLoading(true)
    try {
      const res = await fetch(
        `/api/portals/admin/folders/${folderId}?adminCode=${encodeURIComponent(code)}`,
      )
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Unable to load photos.')
      setPhotos(Array.isArray(data.photos) ? data.photos : [])
    } finally {
      if (showLoading) setPhotosLoading(false)
    }
  }, [])

  const updatePhotoInState = useCallback((photo: PortalPhoto) => {
    setPhotos((current) =>
      sortPortalPhotosByFileName(current.map((item) => (item.id === photo.id ? photo : item))),
    )
  }, [])

  useEffect(() => {
    const code = localStorage.getItem(PORTAL_ADMIN_SESSION_KEY)
    if (!code) {
      router.replace('/admin')
      return
    }
    setAdminCode(code)
    void loadFolders(code)
      .catch((e) => setError(getErrorMessage(e, 'Unable to load folders.')))
      .finally(() => setLoading(false))
  }, [loadFolders, router])

  useEffect(() => {
    if (!adminCode || !selectedFolderId) {
      setPhotos([])
      return
    }
    void loadPhotos(adminCode, selectedFolderId).catch((e) =>
      setError(getErrorMessage(e, 'Unable to load photos.')),
    )
  }, [adminCode, selectedFolderId, loadPhotos])

  useEffect(() => {
    setFolderNameDraft(selectedFolder?.folder_name ?? '')
    setFolderPublicVisibleDraft(selectedFolder?.is_public_visible ?? true)
    setFolderManageOpen(false)
    setFolderManageDeleteConfirm(false)
  }, [selectedFolder])

  useEffect(() => {
    if (!success) return
    const timer = window.setTimeout(() => setSuccess(''), 3000)
    return () => window.clearTimeout(timer)
  }, [success])

  useEffect(() => {
    if (lightboxIndex == null) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setLightboxIndex(null)
        return
      }
      if (photos.length <= 1) return
      if (event.key === 'ArrowLeft') {
        setLightboxIndex((current) => {
          if (current == null) return current
          return (current - 1 + photos.length) % photos.length
        })
      }
      if (event.key === 'ArrowRight') {
        setLightboxIndex((current) => {
          if (current == null) return current
          return (current + 1) % photos.length
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxIndex, photos.length])

  useEffect(() => {
    if (lightboxIndex == null) return
    if (photos.length === 0) {
      setLightboxIndex(null)
      return
    }
    if (lightboxIndex >= photos.length) {
      setLightboxIndex(photos.length - 1)
    }
  }, [photos.length, lightboxIndex])

  function handleFolderSelect(id: string) {
    setSelectedFolderId(id)
    setFoldersPanelOpen(false)
  }

  function clearMessages() {
    setError('')
    setSuccess('')
  }

  function openLightbox(photo: PortalPhoto) {
    const index = photos.findIndex((item) => item.id === photo.id)
    setLightboxIndex(index >= 0 ? index : 0)
  }

  function closeLightbox() {
    setLightboxIndex(null)
  }

  function showPreviousLightboxPhoto() {
    setLightboxIndex((current) => {
      if (current == null || photos.length === 0) return current
      return (current - 1 + photos.length) % photos.length
    })
  }

  function showNextLightboxPhoto() {
    setLightboxIndex((current) => {
      if (current == null || photos.length === 0) return current
      return (current + 1) % photos.length
    })
  }

  async function saveFolderSettings() {
    if (!adminCode || !selectedFolderId || !folderNameDraft.trim()) return
    clearMessages()
    setIsSavingFolderName(true)
    try {
      const res = await fetch(`/api/portals/admin/folders/${selectedFolderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminCode,
          folderName: folderNameDraft.trim(),
          isPublicVisible: folderPublicVisibleDraft,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Unable to update folder.')
      await loadFolders(adminCode)
      closeFolderManage()
      setSuccess('Folder updated.')
    } finally {
      setIsSavingFolderName(false)
    }
  }

  function openFolderManage() {
    clearMessages()
    setFolderNameDraft(selectedFolder?.folder_name ?? '')
    setFolderPublicVisibleDraft(selectedFolder?.is_public_visible ?? true)
    setFolderManageDeleteConfirm(false)
    setFolderManageOpen(true)
  }

  function closeFolderManage() {
    setFolderNameDraft(selectedFolder?.folder_name ?? '')
    setFolderPublicVisibleDraft(selectedFolder?.is_public_visible ?? true)
    setFolderManageDeleteConfirm(false)
    setFolderManageOpen(false)
  }

  async function deleteFolder() {
    if (!adminCode || !selectedFolderId) return
    clearMessages()
    setDeletingFolder(true)
    try {
      const res = await fetch(
        `/api/portals/admin/folders/${selectedFolderId}?adminCode=${encodeURIComponent(adminCode)}`,
        { method: 'DELETE' },
      )
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Unable to delete folder.')
      setSelectedFolderId(null)
      closeFolderManage()
      await loadFolders(adminCode)
      setSuccess('Folder deleted.')
    } finally {
      setDeletingFolder(false)
    }
  }

  function startRenamePhoto(photo: PortalPhoto) {
    clearMessages()
    setConfirmDeletePhotoId(null)
    setRenamingPhotoId(photo.id)
    setRenameDraft(photo.original_file_name)
  }

  function cancelRenamePhoto() {
    setRenamingPhotoId(null)
    setRenameDraft('')
    setSavingRenamePhotoId(null)
  }

  async function saveRenamePhoto(photoId: string) {
    if (!adminCode || !renameDraft.trim()) return
    clearMessages()
    setSavingRenamePhotoId(photoId)
    try {
      const res = await fetch(`/api/portals/admin/photos/${photoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminCode, fileName: renameDraft.trim() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Unable to rename photo.')
      if (!isPortalPhoto(data?.photo)) throw new Error('Rename succeeded but photo data was missing.')
      cancelRenamePhoto()
      updatePhotoInState(data.photo)
      setSuccess('Photo renamed.')
    } finally {
      setSavingRenamePhotoId(null)
    }
  }

  async function deletePhoto(photoId: string) {
    if (!adminCode) return
    clearMessages()
    setDeletingPhotoId(photoId)
    try {
      const res = await fetch(
        `/api/portals/admin/photos/${photoId}?adminCode=${encodeURIComponent(adminCode)}`,
        { method: 'DELETE' },
      )
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Unable to delete photo.')
      setConfirmDeletePhotoId(null)
      setPhotos((current) => current.filter((photo) => photo.id !== photoId))
      await loadFolders(adminCode)
      setSuccess('Photo deleted.')
    } finally {
      setDeletingPhotoId(null)
    }
  }

  function openReplacePicker(photoId: string) {
    clearMessages()
    setReplaceTargetPhotoId(photoId)
    replaceInputRef.current?.click()
  }

  async function replacePhoto(photoId: string, file: File) {
    if (!adminCode) return
    clearMessages()
    setReplacingPhotoId(photoId)
    try {
      const formData = new FormData()
      formData.append('adminCode', adminCode)
      formData.append('file', file)
      const res = await fetch(`/api/portals/admin/photos/${photoId}/replace`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Unable to replace photo.')
      if (!isPortalPhoto(data?.photo)) throw new Error('Replace succeeded but photo data was missing.')
      updatePhotoInState(data.photo)
      setSuccess('Photo replaced.')
    } finally {
      setReplacingPhotoId(null)
      setReplaceTargetPhotoId(null)
    }
  }

  return (
    <PortalFrame
      badge="Admin Portal"
      title="Admin dashboard"
      variant="admin"
    >
      {error ? (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50/90 px-4 py-3 text-sm text-red-700 shadow-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="leading-relaxed">{error}</p>
        </div>
      ) : null}
      {success ? (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-800 shadow-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="leading-relaxed">{success}</p>
        </div>
      ) : null}

      <input
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          const photoId = replaceTargetPhotoId
          e.target.value = ''
          if (!file || !photoId) return
          void replacePhoto(photoId, file).catch((err) =>
            setError(getErrorMessage(err, 'Replace failed.')),
          )
        }}
        ref={replaceInputRef}
        type="file"
      />

      <div className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/75 shadow-[0_20px_60px_-12px_rgba(16,35,63,0.12)] backdrop-blur-sm">
        <div className="grid lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside
            className={`border-b border-slate-100/80 bg-gradient-to-b from-[#f4f6f8] to-white p-4 sm:p-5 lg:border-b-0 lg:border-r ${
              foldersPanelOpen ? 'block' : 'hidden lg:block'
            }`}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[#10233f]">Folders</h2>
                <p className="text-xs text-slate-500">All portal uploads</p>
              </div>
              <button
                aria-label="Refresh folders"
                className="rounded-xl border border-slate-200/80 bg-white p-2.5 text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-[#10233f]"
                disabled={!adminCode || loading}
                onClick={() => adminCode && void loadFolders(adminCode)}
                type="button"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="relative mb-4">
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#10233f] focus:ring-2 focus:ring-[#10233f]/10"
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
                <Folder className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                <p className="text-sm text-slate-500">
                  {folderSearch.trim() ? 'No folders match your search.' : 'No folders yet.'}
                </p>
              </div>
            ) : (
              <FolderTree
                nodes={filteredTree}
                onSelect={handleFolderSelect}
                selectedId={selectedFolderId}
                showPublicVisibility
              />
            )}
          </aside>

          <div className="min-h-[420px] bg-gradient-to-br from-white via-white to-slate-50/60 p-4 sm:min-h-[520px] sm:p-6 lg:p-8">
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

            {!selectedFolder ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/80 bg-white/60 px-6 py-12 text-center sm:min-h-[360px]">
                <ImageIcon className="mb-3 h-10 w-10 text-slate-300" />
                <p className="text-base font-medium text-[#10233f]">Select a folder</p>
                <p className="mt-1 max-w-sm text-sm text-slate-500">
                  Choose a folder to rename it, manage photos, or delete uploads.
                </p>
                <button
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#10233f] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#10233f]/15 transition hover:bg-[#1a3358] lg:hidden"
                  onClick={() => setFoldersPanelOpen(true)}
                  type="button"
                >
                  <PanelLeft className="h-4 w-4" />
                  Browse folders
                </button>
              </div>
            ) : (
              <>
                <div className="mb-5 border-b border-slate-100 pb-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {selectedFolder.uploader_code}
                  </p>
                  <div className="mt-1 flex items-start justify-between gap-3">
                    <h2 className="min-w-0 flex-1 truncate text-xl font-semibold text-[#10233f] sm:text-2xl">
                      {selectedFolder.folder_name}
                    </h2>
                    <button
                      className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-[#10233f] shadow-sm transition hover:bg-slate-50"
                      onClick={openFolderManage}
                      type="button"
                    >
                      <Settings2 className="h-4 w-4" />
                      Manage
                    </button>
                  </div>
                </div>

                <Dialog
                  onOpenChange={(open) => {
                    if (!open) closeFolderManage()
                    else setFolderManageOpen(true)
                  }}
                  open={folderManageOpen}
                >
                  <DialogContent className="rounded-2xl border-slate-200 sm:max-w-md">
                    {folderManageDeleteConfirm ? (
                      <>
                        <DialogHeader>
                          <DialogTitle className="text-[#10233f]">Delete folder?</DialogTitle>
                          <DialogDescription>
                            This will permanently delete{' '}
                            <span className="font-medium text-slate-700">
                              {selectedFolder.folder_name}
                            </span>{' '}
                            and all photos inside it. This cannot be undone.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="gap-2 sm:gap-2">
                          <button
                            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 sm:flex-none"
                            disabled={deletingFolder}
                            onClick={() => setFolderManageDeleteConfirm(false)}
                            type="button"
                          >
                            Back
                          </button>
                          <button
                            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60 sm:flex-none"
                            disabled={deletingFolder}
                            onClick={() =>
                              void deleteFolder().catch((e) =>
                                setError(getErrorMessage(e, 'Unable to delete folder.')),
                              )
                            }
                            type="button"
                          >
                            {deletingFolder ? 'Deleting…' : 'Delete folder'}
                          </button>
                        </DialogFooter>
                      </>
                    ) : (
                      <>
                        <DialogHeader>
                          <DialogTitle className="text-[#10233f]">Manage folder</DialogTitle>
                          <DialogDescription>
                            Rename this folder, control public visibility, or delete it and all of its
                            photos.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700" htmlFor="folder-manage-name">
                              Folder name
                            </label>
                            <input
                              autoFocus
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none transition focus:border-[#10233f] focus:ring-2 focus:ring-[#10233f]/10"
                              id="folder-manage-name"
                              onChange={(e) => setFolderNameDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  void saveFolderSettings().catch((err) =>
                                    setError(getErrorMessage(err, 'Unable to save.')),
                                  )
                                }
                              }}
                              value={folderNameDraft}
                            />
                          </div>
                          {selectedFolder.uploader_code === PHOTOGRAPHER_PORTAL_CODE ? (
                            <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-700">
                                  Visible on public page
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Hidden folders stay in admin and photographer portals, but won&apos;t
                                  appear on the public download page.
                                </p>
                              </div>
                              <Switch
                                checked={folderPublicVisibleDraft}
                                onCheckedChange={setFolderPublicVisibleDraft}
                              />
                            </div>
                          ) : null}
                        </div>
                        <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
                          <button
                            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[#10233f] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#10233f]/15 transition hover:bg-[#1a3358] disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isSavingFolderName || !folderNameDraft.trim()}
                            onClick={() =>
                              void saveFolderSettings().catch((e) =>
                                setError(getErrorMessage(e, 'Unable to save.')),
                              )
                            }
                            type="button"
                          >
                            {isSavingFolderName ? 'Saving…' : 'Save changes'}
                          </button>
                          <button
                            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                            onClick={() => setFolderManageDeleteConfirm(true)}
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete folder
                          </button>
                        </DialogFooter>
                      </>
                    )}
                  </DialogContent>
                </Dialog>

                {photosLoading && photos.length === 0 && !hasChildFolders ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {[1, 2, 3].map((item) => (
                      <div className="overflow-hidden rounded-xl border border-slate-200" key={item}>
                        <div className="aspect-[5/4] animate-pulse bg-slate-100" />
                        <div className="space-y-2 p-3">
                          <div className="h-3 animate-pulse rounded bg-slate-100" />
                          <div className="h-8 animate-pulse rounded bg-slate-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {hasChildFolders ? (
                      <div className="mb-6">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-[#10233f]">Sub-folders</h3>
                            <p className="text-xs text-slate-500">
                              Open a sub-folder to manage its uploads.
                            </p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                            {childFolders.length}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {childFolders.map((folder, index) => {
                            const colors = getSubFolderCardColorByIndex(index)

                            return (
                              <button
                                className={`group rounded-xl border-2 p-4 text-left transition ${colors.card}`}
                                key={folder.id}
                                onClick={() => handleFolderSelect(folder.id)}
                                type="button"
                              >
                                <div className="flex items-start gap-3">
                                  <div className={`rounded-lg bg-white/70 p-2 ${colors.icon}`}>
                                    <Folder className="h-5 w-5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className={`truncate text-sm font-semibold ${colors.title}`}>
                                      {folder.folder_name}
                                    </p>
                                    <p className={`mt-1 text-xs ${colors.meta}`}>
                                      {folder.photo_count === 1
                                        ? '1 photo'
                                        : `${folder.photo_count} photos`}
                                    </p>
                                  </div>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}

                    {photosLoading && photos.length === 0 ? (
                      <p className="text-sm text-slate-500">Loading photos…</p>
                    ) : photos.length === 0 ? (
                      hasChildFolders ? null : (
                        <div className="flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
                          <ImageIcon className="mb-2 h-8 w-8 text-slate-300" />
                          <p className="text-sm text-slate-500">No photos in this folder.</p>
                        </div>
                      )
                    ) : (
                      <div>
                        {hasChildFolders ? (
                          <h3 className="mb-3 text-sm font-semibold text-[#10233f]">Photos in this folder</h3>
                        ) : null}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                          {photos.map((photo) => {
                            const isRenaming = renamingPhotoId === photo.id
                            const isSavingRename = savingRenamePhotoId === photo.id
                            const isDeleting = deletingPhotoId === photo.id
                            const isReplacing = replacingPhotoId === photo.id
                            const isConfirmingDelete = confirmDeletePhotoId === photo.id

                            return (
                              <article
                                className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm"
                                key={photo.id}
                              >
                                <PortalPhotoThumbnail onOpen={openLightbox} photo={photo} />
                                <div className="space-y-2 p-3">
                                  {isRenaming ? (
                                    <div className="space-y-2">
                                      <input
                                        autoFocus
                                        className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-[#10233f] focus:ring-2 focus:ring-[#10233f]/10"
                                        onChange={(e) => setRenameDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            void saveRenamePhoto(photo.id).catch((err) =>
                                              setError(getErrorMessage(err, 'Unable to rename photo.')),
                                            )
                                          }
                                          if (e.key === 'Escape') cancelRenamePhoto()
                                        }}
                                        value={renameDraft}
                                      />
                                      <div className="flex flex-wrap gap-2">
                                        <button
                                          className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1 rounded-lg bg-[#10233f] px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-60 sm:flex-none"
                                          disabled={isSavingRename || !renameDraft.trim()}
                                          onClick={() =>
                                            void saveRenamePhoto(photo.id).catch((err) =>
                                              setError(getErrorMessage(err, 'Unable to rename photo.')),
                                            )
                                          }
                                          type="button"
                                        >
                                          <Check className="h-3.5 w-3.5" />
                                          {isSavingRename ? 'Saving…' : 'Save'}
                                        </button>
                                        <button
                                          className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium sm:flex-none"
                                          disabled={isSavingRename}
                                          onClick={cancelRenamePhoto}
                                          type="button"
                                        >
                                          <X className="h-3.5 w-3.5" />
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="truncate text-sm font-medium text-slate-800">
                                      {photo.original_file_name}
                                    </p>
                                  )}

                                  {!isRenaming ? (
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium transition hover:bg-slate-50 sm:flex-none"
                                        disabled={isDeleting || isReplacing}
                                        onClick={() => startRenamePhoto(photo)}
                                        type="button"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                        Rename
                                      </button>
                                      <button
                                        className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium transition hover:bg-slate-50 disabled:opacity-60 sm:flex-none"
                                        disabled={isDeleting || isReplacing}
                                        onClick={() => openReplacePicker(photo.id)}
                                        type="button"
                                      >
                                        <Upload className="h-3.5 w-3.5" />
                                        {isReplacing ? 'Replacing…' : 'Replace'}
                                      </button>
                                      {isConfirmingDelete ? (
                                        <>
                                          <button
                                            className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-60 sm:flex-none"
                                            disabled={isDeleting}
                                            onClick={() =>
                                              void deletePhoto(photo.id).catch((err) =>
                                                setError(getErrorMessage(err, 'Unable to delete photo.')),
                                              )
                                            }
                                            type="button"
                                          >
                                            {isDeleting ? 'Deleting…' : 'Confirm'}
                                          </button>
                                          <button
                                            className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium sm:flex-none"
                                            disabled={isDeleting}
                                            onClick={() => setConfirmDeletePhotoId(null)}
                                            type="button"
                                          >
                                            Cancel
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 sm:flex-none"
                                          disabled={isDeleting || isReplacing}
                                          onClick={() => {
                                            clearMessages()
                                            setConfirmDeletePhotoId(photo.id)
                                          }}
                                          type="button"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                          Delete
                                        </button>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              </article>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
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

          {photos.length > 1 ? (
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
            <div className="mb-3 flex flex-col items-center justify-center gap-1 px-2 sm:flex-row sm:gap-3">
              <p className="max-w-[90vw] truncate text-sm font-medium text-white sm:max-w-none">
                {currentLightboxPhoto.original_file_name}
              </p>
              {photos.length > 1 ? (
                <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/80">
                  {(lightboxIndex ?? 0) + 1} / {photos.length}
                </span>
              ) : null}
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
