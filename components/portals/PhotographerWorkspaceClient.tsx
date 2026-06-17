'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  ImagePlus,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react'

import FolderTree from '@/components/portals/FolderTree'
import PortalFrame from '@/components/portals/PortalFrame'
import { getSubFolderCardColorByIndex } from '@/components/portals/sub-folder-card-colors'
import { MAX_PHOTO_UPLOAD_BYTES, MAX_VIDEO_UPLOAD_BYTES, MULTIPART_VIDEO_THRESHOLD_BYTES } from '@/lib/photo-upload-limits'
import type { PortalFolder, PortalFolderNode, PortalPhoto } from '@/lib/portals/types'
import {
  inferPortalContentType,
  isAllowedPortalUpload,
  isPortalImageFileName,
  isPortalVideoFileName,
} from '@/lib/portals/upload-file-utils'

const MAX_IMAGE_PREVIEW_COUNT = 20
const MAX_IMAGE_PREVIEW_BYTES = 20 * 1024 * 1024
const MULTIPART_PART_CONCURRENCY = 4

type SelectedPreview = {
  name: string
  url: string
}

type PresignedPortalUpload = {
  bucketName: string
  contentType: string
  fileName: string
  index: number
  partSizeBytes?: number
  partUrls?: Array<{ partNumber: number; uploadUrl: string }>
  storagePath: string
  uploadId?: string
  uploadMode: 'multipart' | 'single'
  uploadUrl?: string
}

type CompletedMultipartUpload = {
  parts: Array<{ eTag: string; partNumber: number }>
  uploadId: string
}

function formatMaxUploadLabel(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024 && bytes % (1024 * 1024 * 1024) === 0) {
    return `${bytes / (1024 * 1024 * 1024)} GB`
  }

  return `${bytes / (1024 * 1024)} MB`
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${bytes} B`
}

async function uploadMultipartParts(
  file: File,
  upload: PresignedPortalUpload,
): Promise<CompletedMultipartUpload> {
  if (!upload.uploadId || !upload.partUrls?.length || !upload.partSizeBytes) {
    throw new Error(`Upload preparation failed for "${file.name}".`)
  }

  const parts: Array<{ eTag: string; partNumber: number }> = []
  const partUrls = upload.partUrls
  const partSizeBytes = upload.partSizeBytes

  for (let offset = 0; offset < partUrls.length; offset += MULTIPART_PART_CONCURRENCY) {
    const batch = partUrls.slice(offset, offset + MULTIPART_PART_CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map(async (part) => {
        const start = (part.partNumber - 1) * partSizeBytes
        const end = Math.min(start + partSizeBytes, file.size)
        const putRes = await fetch(part.uploadUrl, {
          method: 'PUT',
          body: file.slice(start, end),
        })

        if (!putRes.ok) {
          throw new Error(
            `Failed to upload "${file.name}" to storage. If this is a video, ensure your S3 bucket allows browser uploads (CORS PUT + ExposeHeaders: ETag).`,
          )
        }

        const eTag = putRes.headers.get('ETag')?.replace(/^"|"$/g, '')
        if (!eTag) {
          throw new Error(
            `Missing upload confirmation for "${file.name}". Ensure S3 CORS exposes the ETag header.`,
          )
        }

        return { partNumber: part.partNumber, eTag }
      }),
    )
    parts.push(...batchResults)
  }

  return { uploadId: upload.uploadId, parts }
}

async function uploadFileToStorage(
  file: File,
  upload: PresignedPortalUpload,
): Promise<CompletedMultipartUpload | null> {
  if (upload.uploadMode === 'multipart') {
    return uploadMultipartParts(file, upload)
  }

  if (!upload.uploadUrl) {
    throw new Error(`Upload preparation failed for "${file.name}".`)
  }

  const putRes = await fetch(upload.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': upload.contentType },
  })

  if (!putRes.ok) {
    throw new Error(
      `Failed to upload "${file.name}" to storage. If this is a video, ensure your S3 bucket allows browser uploads (CORS PUT + ExposeHeaders: ETag).`,
    )
  }

  return null
}

async function uploadMediaBatchViaServer(folderId: string, files: File[]): Promise<PortalPhoto[]> {
  const formData = new FormData()
  for (const file of files) {
    formData.append('files', file, file.name)
  }

  const res = await fetch(`/api/portals/photographers/folders/${folderId}/photos`, {
    method: 'POST',
    body: formData,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.error || 'Unable to upload files.')
  }

  return Array.isArray(data?.photos) ? (data.photos as PortalPhoto[]) : []
}

function isDirectStorageUploadError(error: unknown) {
  return error instanceof TypeError && /failed to fetch/i.test(error.message)
}

async function uploadDirectToStoragePortalFile(folderId: string, file: File): Promise<PortalPhoto> {
  const contentType = inferPortalContentType(file.name, file.type)

  let presignRes: Response
  try {
    presignRes = await fetch(`/api/portals/photographers/folders/${folderId}/photos/presign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: [
          {
            fileName: file.name,
            contentType,
            fileSizeBytes: file.size,
          },
        ],
      }),
    })
  } catch (error) {
    if (isDirectStorageUploadError(error)) {
      throw new Error(
        `"${file.name}" could not reach storage. Large videos need S3 bucket CORS (PUT + ExposeHeaders: ETag) or upload a smaller file.`,
      )
    }
    throw error
  }

  const presignData = await presignRes.json().catch(() => null)
  if (!presignRes.ok) {
    throw new Error(presignData?.error || `Unable to prepare upload for "${file.name}".`)
  }

  const upload = (presignData?.uploads?.[0] ?? null) as PresignedPortalUpload | null
  if (!upload) {
    throw new Error(`Upload preparation failed for "${file.name}".`)
  }

  let multipart: CompletedMultipartUpload | null
  try {
    multipart = await uploadFileToStorage(file, upload)
  } catch (error) {
    if (isDirectStorageUploadError(error)) {
      throw new Error(
        `"${file.name}" was blocked by the browser when uploading to S3. Ask your admin to enable bucket CORS for PUT from this site.`,
      )
    }
    throw error
  }

  const completeRes = await fetch(`/api/portals/photographers/folders/${folderId}/photos/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uploads: [
        {
          fileName: upload.fileName,
          contentType: upload.contentType,
          fileSizeBytes: file.size,
          bucketName: upload.bucketName,
          storagePath: upload.storagePath,
          multipart: multipart ?? undefined,
        },
      ],
    }),
  })
  const completeData = await completeRes.json().catch(() => null)
  if (!completeRes.ok) {
    throw new Error(completeData?.error || `Unable to save "${file.name}".`)
  }
  const photo = (completeData?.photos?.[0] ?? null) as PortalPhoto | null
  if (!photo) {
    throw new Error(`Upload failed for "${file.name}".`)
  }
  return photo
}

export default function PhotographerWorkspaceClient() {
  const [tree, setTree] = useState<PortalFolderNode[]>([])
  const [folders, setFolders] = useState<PortalFolder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [photos, setPhotos] = useState<PortalPhoto[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [selectedPreviews, setSelectedPreviews] = useState<SelectedPreview[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ current: number; name: string; total: number } | null>(
    null,
  )
  const [isCreatingRootFolder, setIsCreatingRootFolder] = useState(false)
  const [isCreatingChildFolder, setIsCreatingChildFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [isSavingFolder, setIsSavingFolder] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewSignatureRef = useRef('')
  const previewUrlsRef = useRef<SelectedPreview[]>([])
  const uploadInputId = useId()

  const currentLightboxPhoto = lightboxIndex != null ? photos[lightboxIndex] ?? null : null

  function isVideoFileName(name: string) {
    return isPortalVideoFileName(name)
  }

  const selectedFolder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  )

  const parentFolder = useMemo(() => {
    if (!selectedFolder?.parent_folder_id) return null
    return folders.find((folder) => folder.id === selectedFolder.parent_folder_id) ?? null
  }, [folders, selectedFolder])

  const subFolders = useMemo(() => {
    if (!selectedFolder || selectedFolder.parent_folder_id) return []
    return folders.filter((folder) => folder.parent_folder_id === selectedFolder.id)
  }, [folders, selectedFolder])

  const isMainFolder = Boolean(selectedFolder && !selectedFolder.parent_folder_id)
  const isSubFolder = Boolean(selectedFolder?.parent_folder_id)

  const loadFolders = useCallback(async () => {
    const res = await fetch('/api/portals/photographers/folders')
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error || 'Unable to load folders.')
    const nextFolders = Array.isArray(data.folders) ? data.folders : []
    setFolders(nextFolders)
    setTree(Array.isArray(data.tree) ? data.tree : [])
    return nextFolders as PortalFolder[]
  }, [])

  const loadPhotos = useCallback(async (folderId: string) => {
    const res = await fetch(`/api/portals/photographers/folders/${folderId}/photos`)
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error || 'Unable to load photos.')
    setPhotos(Array.isArray(data.photos) ? data.photos : [])
  }, [])

  useEffect(() => {
    void loadFolders()
      .then((nextFolders) => {
        const root = nextFolders.find((f) => !f.parent_folder_id)
        if (root) setSelectedFolderId((current) => current ?? root.id)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Unable to load folders.'))
      .finally(() => setLoading(false))
  }, [loadFolders])

  useEffect(() => {
    if (!selectedFolderId || !isSubFolder) {
      setPhotos((current) => (current.length === 0 ? current : []))
      setLightboxIndex((current) => (current === null ? current : null))
      return
    }

    let cancelled = false
    void loadPhotos(selectedFolderId).catch((e) => {
      if (!cancelled) {
        setError(e instanceof Error ? e.message : 'Unable to load photos.')
      }
    })

    return () => {
      cancelled = true
    }
  }, [selectedFolderId, isSubFolder, loadPhotos])

  useEffect(() => {
    const previewableImages = files
      .filter(
        (file) =>
          (file.type.startsWith('image/') || isPortalImageFileName(file.name)) &&
          file.size <= MAX_IMAGE_PREVIEW_BYTES,
      )
      .slice(0, MAX_IMAGE_PREVIEW_COUNT)

    const signature = previewableImages
      .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
      .join('|')

    if (signature === previewSignatureRef.current) {
      return
    }

    previewSignatureRef.current = signature
    previewUrlsRef.current.forEach((preview) => URL.revokeObjectURL(preview.url))

    const next: SelectedPreview[] = previewableImages.map((file) => ({
      name: file.name,
      url: URL.createObjectURL(file),
    }))
    previewUrlsRef.current = next
    setSelectedPreviews(next)
  }, [files])

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((preview) => URL.revokeObjectURL(preview.url))
      previewUrlsRef.current = []
      previewSignatureRef.current = ''
    }
  }, [])

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

  function resetCreateFolderState() {
    setNewFolderName('')
    setIsCreatingRootFolder(false)
    setIsCreatingChildFolder(false)
  }

  async function createFolder(folderName: string, parentFolderId?: string | null) {
    setIsSavingFolder(true)
    setError('')
    try {
      const res = await fetch('/api/portals/photographers/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderName, parentFolderId: parentFolderId ?? null }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Unable to create folder.')
      const nextFolders = await loadFolders()
      if (data.folder?.id) {
        if (parentFolderId) {
          setSelectedFolderId(parentFolderId)
        } else {
          setSelectedFolderId(data.folder.id)
        }
      } else {
        const root = nextFolders.find((f) => !f.parent_folder_id)
        if (root) setSelectedFolderId(root.id)
      }
      setSuccess(parentFolderId ? `Sub-folder "${folderName}" created.` : `Main folder "${folderName}" created.`)
      if (parentFolderId) {
        setSelectedFolderId(parentFolderId)
        setNewFolderName('')
        setIsCreatingRootFolder(false)
        setIsCreatingChildFolder(true)
      } else {
        if (data.folder?.id) setSelectedFolderId(data.folder.id)
        setNewFolderName('')
        setIsCreatingRootFolder(true)
        setIsCreatingChildFolder(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create folder.')
    } finally {
      setIsSavingFolder(false)
    }
  }

  async function uploadPhotos() {
    if (!selectedFolderId || files.length === 0) return
    setUploading(true)
    setUploadProgress(null)
    setError('')
    setSuccess('')

    const validFiles = files.filter((file) => isAllowedPortalUpload(file.name, file.type))
    const invalidFiles = files.filter((file) => !isAllowedPortalUpload(file.name, file.type))

    if (validFiles.length === 0) {
      setError('Only image and video files are allowed.')
      setUploading(false)
      return
    }

    const oversized = validFiles.filter((file) => {
      const isVideo = isPortalVideoFileName(file.name) || file.type.startsWith('video/')
      const maxBytes = isVideo ? MAX_VIDEO_UPLOAD_BYTES : MAX_PHOTO_UPLOAD_BYTES
      return file.size > maxBytes
    })
    const filesToUpload = validFiles.filter((file) => !oversized.includes(file))

    if (filesToUpload.length === 0) {
      const first = oversized[0] ?? invalidFiles[0]
      if (first) {
        const isVideo = isPortalVideoFileName(first.name) || first.type.startsWith('video/')
        const maxBytes = isVideo ? MAX_VIDEO_UPLOAD_BYTES : MAX_PHOTO_UPLOAD_BYTES
        setError(`File "${first.name}" is too large. Max allowed is ${formatMaxUploadLabel(maxBytes)}.`)
      } else {
        setError('Only image and video files are allowed.')
      }
      setUploading(false)
      return
    }

    let uploadedCount = 0
    const failures: string[] = []
    const skippedMessages: string[] = []

    if (invalidFiles.length > 0) {
      skippedMessages.push(
        `${invalidFiles.length} file(s) skipped (not an image or video): ${invalidFiles
          .slice(0, 3)
          .map((file) => file.name)
          .join(', ')}${invalidFiles.length > 3 ? '…' : ''}`,
      )
    }

    if (oversized.length > 0) {
      skippedMessages.push(
        `${oversized.length} file(s) skipped (too large): ${oversized
          .slice(0, 3)
          .map((file) => file.name)
          .join(', ')}${oversized.length > 3 ? '…' : ''}`,
      )
    }

    try {
      const photoFiles = filesToUpload.filter(
        (file) =>
          !isPortalVideoFileName(file.name) &&
          !file.type.startsWith('video/') &&
          !inferPortalContentType(file.name, file.type).startsWith('video/'),
      )
      const videoFiles = filesToUpload.filter((file) => !photoFiles.includes(file))
      const serverVideos = videoFiles.filter((file) => file.size <= MULTIPART_VIDEO_THRESHOLD_BYTES)
      const directVideos = videoFiles.filter((file) => file.size > MULTIPART_VIDEO_THRESHOLD_BYTES)
      const uploadQueue: File[] = [...photoFiles, ...serverVideos, ...directVideos]
      let progressIndex = 0

      const mergePhotos = (nextPhotos: PortalPhoto[]) => {
        if (nextPhotos.length === 0) return
        uploadedCount += nextPhotos.length
        setPhotos((current) => {
          const incomingIds = new Set(nextPhotos.map((photo) => photo.id))
          return [...nextPhotos, ...current.filter((photo) => !incomingIds.has(photo.id))]
        })
      }

      for (let offset = 0; offset < photoFiles.length; offset += 10) {
        const batch = photoFiles.slice(offset, offset + 10)
        progressIndex += batch.length
        setUploadProgress({
          current: progressIndex,
          total: uploadQueue.length,
          name: batch.length === 1 ? batch[0].name : `${batch.length} photos`,
        })

        try {
          mergePhotos(await uploadMediaBatchViaServer(selectedFolderId, batch))
        } catch (error) {
          for (const file of batch) {
            failures.push(
              `${file.name}: ${error instanceof Error ? error.message : 'Upload failed.'}`,
            )
          }
        }
      }

      for (const file of serverVideos) {
        progressIndex++
        setUploadProgress({
          current: progressIndex,
          total: uploadQueue.length,
          name: file.name,
        })

        try {
          mergePhotos(await uploadMediaBatchViaServer(selectedFolderId, [file]))
        } catch (error) {
          failures.push(
            `${file.name}: ${error instanceof Error ? error.message : 'Upload failed.'}`,
          )
        }
      }

      for (const file of directVideos) {
        progressIndex++
        setUploadProgress({
          current: progressIndex,
          total: uploadQueue.length,
          name: file.name,
        })

        try {
          mergePhotos([await uploadDirectToStoragePortalFile(selectedFolderId, file)])
        } catch (error) {
          failures.push(
            `${file.name}: ${error instanceof Error ? error.message : 'Upload failed.'}`,
          )
        }
      }

      if (uploadedCount > 0) {
        setFiles([])
        setSelectedPreviews([])
        await Promise.all([loadPhotos(selectedFolderId), loadFolders()])
      }

      if (uploadedCount === filesToUpload.length) {
        setSuccess(`Uploaded ${uploadedCount} file(s).`)
      } else if (uploadedCount > 0) {
        setSuccess(`Uploaded ${uploadedCount} of ${filesToUpload.length} file(s).`)
      }

      const messages: string[] = [...skippedMessages]
      if (failures.length > 0) {
        messages.push(failures.slice(0, 3).join(' · '))
        if (failures.length > 3) {
          messages.push(`and ${failures.length - 3} more failed.`)
        }
      }
      if (messages.length > 0) {
        setError(messages.join(' '))
      } else if (uploadedCount === 0) {
        setError('No files were uploaded.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to upload photos.')
    } finally {
      setUploadProgress(null)
      setUploading(false)
    }
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

  function handleSelectedFiles(fileList: FileList | null) {
    if (!fileList?.length) return
    setFiles(Array.from(fileList))
  }

  const uploadPercent = uploadProgress
    ? Math.round((uploadProgress.current / uploadProgress.total) * 100)
    : 0

  return (
    <PortalFrame
      badge="Photographer Portal"
      title="Upload workspace"
      variant="photographer"
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

      <div className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/75 shadow-[0_20px_60px_-12px_rgba(16,35,63,0.12)] backdrop-blur-sm">
        <div className="grid lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="border-b border-slate-100/80 bg-gradient-to-b from-[#faf8f6] to-white p-5 lg:border-b-0 lg:border-r">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[#10233f]">Your folders</h2>
                <p className="text-xs text-slate-500">Main folders and sub-folders</p>
              </div>
              <button
                aria-label="Refresh folders"
                className="rounded-xl border border-slate-200/80 bg-white p-2 text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-[#10233f]"
                disabled={loading}
                onClick={() => void loadFolders()}
                type="button"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {!isCreatingRootFolder ? (
              <button
                className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#c6603d]/35 bg-[#fff8f5] px-3 py-3 text-sm font-medium text-[#ae5536] transition hover:border-[#c6603d]/60 hover:bg-[#fff3ee]"
                onClick={() => {
                  resetCreateFolderState()
                  setIsCreatingRootFolder(true)
                }}
                type="button"
              >
                <FolderPlus className="h-4 w-4" />
                New main folder
              </button>
            ) : null}

            {isCreatingRootFolder ? (
              <form
                className="mb-4 space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!newFolderName.trim()) return
                  void createFolder(newFolderName.trim(), null)
                }}
              >
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">New main folder</p>
                <input
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm outline-none transition focus:border-[#c6603d] focus:bg-white focus:ring-2 focus:ring-[#c6603d]/15"
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. March shoot"
                  value={newFolderName}
                />
                <div className="flex gap-2">
                  <button
                    className="flex-1 rounded-xl bg-[#c6603d] px-3 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#c6603d]/20 transition hover:bg-[#ae5536] disabled:opacity-60"
                    disabled={isSavingFolder || !newFolderName.trim()}
                    type="submit"
                  >
                    Create
                  </button>
                  <button
                    className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50"
                    onClick={resetCreateFolderState}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((item) => (
                  <div className="h-10 animate-pulse rounded-xl bg-slate-100" key={item} />
                ))}
              </div>
            ) : tree.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-8 text-center">
                <FolderPlus className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                <p className="text-sm text-slate-500">Create your first main folder to begin.</p>
              </div>
            ) : (
              <FolderTree
                nodes={tree}
                onSelect={setSelectedFolderId}
                selectedId={selectedFolderId}
                variant="photographer"
              />
            )}
          </aside>

          <div className="min-h-[520px] bg-gradient-to-br from-white via-white to-slate-50/60 p-6 sm:p-8">
          {!selectedFolder ? (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-slate-200/80 bg-white/50 px-6 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#c6603d]/10 text-[#c6603d]">
                <FolderPlus className="h-7 w-7" />
              </div>
              <p className="text-lg font-semibold text-[#10233f]">Select a folder to continue</p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                Pick a main folder to manage sub-folders, or open a sub-folder to upload photos and videos.
              </p>
            </div>
          ) : (
            <>
              <div className="border-b border-slate-100/90 pb-5">
                {isSubFolder && parentFolder ? (
                  <button
                    className="mb-3 inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-200/70 hover:text-[#10233f]"
                    onClick={() => setSelectedFolderId(parentFolder.id)}
                    type="button"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back to {parentFolder.folder_name}
                  </button>
                ) : null}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <span className="inline-flex rounded-full bg-[#10233f]/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#10233f]/70">
                      {isMainFolder ? 'Main folder' : 'Sub-folder'}
                    </span>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#10233f]">
                      {selectedFolder.folder_name}
                    </h2>
                  </div>
                  {isMainFolder && !isCreatingChildFolder ? (
                    <button
                      className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#10233f] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#10233f]/15 transition hover:bg-[#1a3354]"
                      onClick={() => {
                        resetCreateFolderState()
                        setIsCreatingChildFolder(true)
                      }}
                      type="button"
                    >
                      <FolderPlus className="h-4 w-4" />
                      Create sub-folder
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 space-y-6">
                {isMainFolder ? (
                  <>
                    {isCreatingChildFolder ? (
                      <form
                        className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"
                        onSubmit={(e) => {
                          e.preventDefault()
                          if (!newFolderName.trim() || !selectedFolder || selectedFolder.parent_folder_id) return
                          void createFolder(newFolderName.trim(), selectedFolder.id)
                        }}
                      >
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                          New sub-folder inside &ldquo;{selectedFolder?.folder_name}&rdquo;
                        </p>
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                          <input
                            autoFocus
                            className="flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm outline-none transition focus:border-[#c6603d] focus:bg-white focus:ring-2 focus:ring-[#c6603d]/15"
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder="Sub-folder name"
                            value={newFolderName}
                          />
                          <div className="flex gap-2">
                            <button
                              className="rounded-xl bg-[#c6603d] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#c6603d]/20 transition hover:bg-[#ae5536] disabled:opacity-60"
                              disabled={isSavingFolder || !newFolderName.trim()}
                              type="submit"
                            >
                              Create
                            </button>
                            <button
                              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50"
                              onClick={resetCreateFolderState}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </form>
                    ) : null}

                    {subFolders.length > 0 ? (
                      <div>
                        <h3 className="mb-3 text-sm font-semibold text-[#10233f]">Sub-folders</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {subFolders.map((folder, index) => {
                            const colors = getSubFolderCardColorByIndex(index)

                            return (
                            <button
                              key={folder.id}
                              className={`rounded-2xl border-2 px-4 py-4 text-left text-sm font-medium shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${colors.card}`}
                              onClick={() => setSelectedFolderId(folder.id)}
                              type="button"
                            >
                              <span className={`block truncate text-base font-semibold ${colors.title}`}>
                                {folder.folder_name}
                              </span>
                              <span className={`mt-1.5 block text-xs ${colors.meta}`}>
                                {folder.photo_count} photo{folder.photo_count === 1 ? '' : 's'}
                              </span>
                            </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-[1.5rem] border border-dashed border-slate-200/80 bg-white/60 px-6 py-10 text-center">
                        <p className="text-sm text-slate-500">
                          No sub-folders yet. Create one, then open it to upload photos.
                        </p>
                        {!isCreatingChildFolder ? (
                          <button
                            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#c6603d] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#c6603d]/20 transition hover:bg-[#ae5536]"
                            onClick={() => {
                              resetCreateFolderState()
                              setIsCreatingChildFolder(true)
                            }}
                            type="button"
                          >
                            <FolderPlus className="h-4 w-4" />
                            Create your first sub-folder
                          </button>
                        ) : null}
                      </div>
                    )}
                  </>
                ) : null}

                {isSubFolder ? (
                  <>
                    <div className="rounded-[1.5rem] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-[#10233f]">Upload media</h3>
                        </div>
                        {files.length > 0 || uploading ? (
                          <button
                            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#c6603d] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#c6603d]/20 transition hover:bg-[#ae5536] disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={uploading}
                            onClick={() => void uploadPhotos()}
                            type="button"
                          >
                            <ImagePlus className="h-4 w-4" />
                            {uploading
                              ? uploadProgress
                                ? `Uploading ${uploadProgress.current}/${uploadProgress.total}…`
                                : 'Uploading...'
                              : `Upload ${files.length} file${files.length === 1 ? '' : 's'}`}
                          </button>
                        ) : null}
                      </div>

                      <input
                        ref={fileInputRef}
                        accept="image/*,video/*"
                        className="sr-only"
                        id={uploadInputId}
                        multiple
                        onChange={(e) => handleSelectedFiles(e.target.files)}
                        type="file"
                      />

                      <label
                        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
                          isDragging
                            ? 'border-[#c6603d] bg-[#fff5f0]'
                            : 'border-slate-200 bg-slate-50/50 hover:border-[#c6603d]/40 hover:bg-[#fffaf8]'
                        }`}
                        htmlFor={uploadInputId}
                        onDragEnter={(e) => {
                          e.preventDefault()
                          setIsDragging(true)
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault()
                          setIsDragging(false)
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault()
                          setIsDragging(false)
                          handleSelectedFiles(e.dataTransfer.files)
                        }}
                      >
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#c6603d]/10 text-[#c6603d]">
                          <Upload className="h-5 w-5" />
                        </div>
                        <p className="text-sm font-semibold text-[#10233f]">
                          Drop files here or click to browse
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Photos up to {formatMaxUploadLabel(MAX_PHOTO_UPLOAD_BYTES)} · Videos up to{' '}
                          {formatMaxUploadLabel(MAX_VIDEO_UPLOAD_BYTES)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Original quality is preserved — files are not compressed or resized.
                        </p>
                      </label>

                      {files.length > 0 ? (
                        <div className="mt-5 space-y-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-[#10233f]">
                              {files.length} file{files.length === 1 ? '' : 's'} selected
                            </p>
                            <button
                              className="text-xs font-medium text-slate-500 transition hover:text-[#10233f]"
                              onClick={() => setFiles([])}
                              type="button"
                            >
                              Clear all
                            </button>
                          </div>

                          <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-2xl border border-slate-200/80 bg-slate-50/70 p-2">
                            {files.map((file) => (
                              <div
                                className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs shadow-sm"
                                key={`${file.name}-${file.size}-${file.lastModified}`}
                              >
                                <span className="truncate text-slate-700">{file.name}</span>
                                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
                                  {isPortalVideoFileName(file.name) || file.type.startsWith('video/')
                                    ? 'Video'
                                    : 'Photo'}{' '}
                                  · {formatFileSize(file.size)}
                                </span>
                              </div>
                            ))}
                          </div>

                          {selectedPreviews.length > 0 ? (
                            <div>
                              <p className="mb-2 text-xs text-slate-500">
                                Preview
                                {files.length > selectedPreviews.length
                                  ? ` (${selectedPreviews.length} of ${files.length})`
                                  : ''}
                              </p>
                              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {selectedPreviews.map((preview) => (
                                  <div
                                    className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm"
                                    key={preview.url}
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      alt={preview.name}
                                      className="aspect-square w-full object-cover"
                                      src={preview.url}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {uploadProgress ? (
                        <div className="mt-5 rounded-2xl border border-[#c6603d]/15 bg-[#fff8f5] p-4">
                          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                            <p className="font-medium text-[#10233f]">
                              Uploading {uploadProgress.current} of {uploadProgress.total}
                            </p>
                            <span className="text-[#c6603d]">{uploadPercent}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-[#c6603d]/10">
                            <div
                              className="h-full rounded-full bg-[#c6603d] transition-all duration-300"
                              style={{ width: `${uploadPercent}%` }}
                            />
                          </div>
                          <p className="mt-2 truncate text-xs text-slate-500">{uploadProgress.name}</p>
                        </div>
                      ) : null}
                    </div>

                    {photos.length > 0 ? (
                      <div>
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <h3 className="text-base font-semibold text-[#10233f]">Uploaded media</h3>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                            {photos.length} item{photos.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                          {photos.map((photo) => (
                            <div
                              className="group overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition hover:shadow-md"
                              key={photo.id}
                            >
                              <button
                                aria-label={`Open ${photo.original_file_name}`}
                                className="block aspect-square w-full cursor-zoom-in overflow-hidden bg-slate-100 p-0"
                                onClick={() => openLightbox(photo)}
                                type="button"
                              >
                                {isVideoFileName(photo.original_file_name) ? (
                                  <video
                                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                                    src={photo.image_url}
                                    preload="metadata"
                                    muted
                                  />
                                ) : (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    alt={photo.original_file_name}
                                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                                    src={photo.image_url}
                                  />
                                )}
                              </button>
                              <p className="truncate px-3 py-2 text-xs text-slate-600">
                                {photo.original_file_name}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </>
          )}
          </div>
        </div>
      </div>

      {currentLightboxPhoto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#10233f]/90 px-4 backdrop-blur-sm"
          onClick={closeLightbox}
        >
          <button
            aria-label="Close photo preview"
            className="absolute right-4 top-4 z-20 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20"
            onClick={closeLightbox}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>

          {photos.length > 1 ? (
            <>
              <button
                aria-label="Previous photo"
                className="absolute left-4 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
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
                className="absolute right-4 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
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
            <div className="mb-3 flex items-center justify-center gap-3">
              <p className="truncate text-sm font-medium text-white">
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
                className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
                key={currentLightboxPhoto.id}
                src={currentLightboxPhoto.image_url}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={currentLightboxPhoto.original_file_name}
                className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
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
