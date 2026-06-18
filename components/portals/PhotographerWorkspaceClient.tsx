'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  ImagePlus,
  Link2,
  PanelLeft,
  RefreshCw,
  Settings2,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

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
import {
  MAX_PHOTO_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  PORTAL_MULTIPART_PART_CONCURRENCY,
  PORTAL_UPLOAD_CONCURRENCY,
} from '@/lib/photo-upload-limits'
import { getPublicPortalFolderUrl } from '@/lib/portals/constants'
import {
  canPortalFileUseServerUpload,
  getPortalPresignBatchSize,
  getPortalUploadConcurrency,
  isDirectStorageFetchError,
  prefersPortalServerUpload,
  shouldFallbackPortalUploadToServer,
  shouldPortalFileUseServerUploadFirst,
} from '@/lib/portals/upload-client-utils'
import type { PortalFolder, PortalFolderNode, PortalPhoto } from '@/lib/portals/types'
import {
  inferPortalContentType,
  isAllowedPortalUpload,
  isPortalImageFileName,
  isPortalVideoFileName,
} from '@/lib/portals/upload-file-utils'

const MAX_IMAGE_PREVIEW_COUNT = 20
const MAX_IMAGE_PREVIEW_BYTES = 20 * 1024 * 1024

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

function buildFolderShareUrl(folderId: string) {
  if (typeof window !== 'undefined') {
    const url = new URL('/public', window.location.origin)
    url.searchParams.set('folder', folderId)
    return url.toString()
  }

  return getPublicPortalFolderUrl(folderId)
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

  for (let offset = 0; offset < partUrls.length; offset += PORTAL_MULTIPART_PART_CONCURRENCY) {
    const batch = partUrls.slice(offset, offset + PORTAL_MULTIPART_PART_CONCURRENCY)
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

const UPLOAD_REQUEST_TIMEOUT_MS = 10 * 60 * 1000

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = UPLOAD_REQUEST_TIMEOUT_MS,
) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Upload timed out. Try again with fewer or smaller files.')
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function uploadMediaFileViaServer(folderId: string, file: File): Promise<PortalPhoto> {
  const formData = new FormData()
  formData.append('files', file, file.name)

  const res = await fetchWithTimeout(`/api/portals/photographers/folders/${folderId}/photos`, {
    method: 'POST',
    body: formData,
  })
  const rawBody = await res.text()
  let data: { error?: string; photos?: PortalPhoto[] } | null = null
  if (rawBody) {
    try {
      data = JSON.parse(rawBody) as { error?: string; photos?: PortalPhoto[] }
    } catch {
      data = null
    }
  }

  if (!res.ok) {
    if (res.status === 413) {
      throw new Error(
        `"${file.name}" is too large for a single upload request. Try a smaller file or compress it first.`,
      )
    }
    throw new Error(data?.error || `"${file.name}" could not be uploaded (HTTP ${res.status}).`)
  }

  const photo = Array.isArray(data?.photos) ? data.photos[0] : null
  if (!photo) {
    throw new Error(`"${file.name}" uploaded but the server did not return photo data.`)
  }

  return photo
}

function isDirectStorageUploadError(error: unknown) {
  return isDirectStorageFetchError(error)
}

function shouldFallbackToServerUpload(error: unknown) {
  return shouldFallbackPortalUploadToServer(error)
}

async function uploadPortalFileDirect(folderId: string, file: File): Promise<PortalPhoto> {
  const [upload] = await presignPortalFiles(folderId, [file])
  const multipart = await uploadFileToStorage(file, upload)
  const [photo] = await completePresignedPortalBatch(folderId, [{ file, upload, multipart }])
  if (!photo) {
    throw new Error(`Upload failed for "${file.name}".`)
  }
  return photo
}

async function uploadPortalFileResolved(folderId: string, file: File): Promise<PortalPhoto> {
  if (shouldPortalFileUseServerUploadFirst(file)) {
    try {
      return await uploadMediaFileViaServer(folderId, file)
    } catch (serverError) {
      try {
        return await uploadPortalFileDirect(folderId, file)
      } catch {
        throw serverError
      }
    }
  }

  return uploadPortalFileWithFallback(folderId, file)
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  if (items.length === 0) return

  let nextIndex = 0
  const poolSize = Math.min(concurrency, items.length)

  await Promise.all(
    Array.from({ length: poolSize }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex
        nextIndex += 1
        await worker(items[index], index)
      }
    }),
  )
}

async function presignPortalFiles(folderId: string, files: File[]): Promise<PresignedPortalUpload[]> {
  const presignRes = await fetchWithTimeout(`/api/portals/photographers/folders/${folderId}/photos/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: files.map((file) => ({
        fileName: file.name,
        contentType: inferPortalContentType(file.name, file.type),
        fileSizeBytes: file.size,
      })),
    }),
  })

  const presignData = await presignRes.json().catch(() => null)
  if (!presignRes.ok) {
    throw new Error(presignData?.error || 'Unable to prepare uploads.')
  }

  const uploads = Array.isArray(presignData?.uploads) ? (presignData.uploads as PresignedPortalUpload[]) : []
  if (uploads.length !== files.length) {
    throw new Error('Upload preparation returned incomplete results.')
  }

  return uploads
}

async function completePresignedPortalBatch(
  folderId: string,
  items: Array<{
    file: File
    multipart: CompletedMultipartUpload | null
    upload: PresignedPortalUpload
  }>,
): Promise<PortalPhoto[]> {
  if (items.length === 0) return []

  const completeRes = await fetchWithTimeout(`/api/portals/photographers/folders/${folderId}/photos/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uploads: items.map(({ file, upload, multipart }) => ({
        fileName: upload.fileName,
        contentType: upload.contentType,
        fileSizeBytes: file.size,
        bucketName: upload.bucketName,
        storagePath: upload.storagePath,
        multipart: multipart ?? undefined,
      })),
    }),
  })
  const completeData = await completeRes.json().catch(() => null)
  if (!completeRes.ok) {
    throw new Error(completeData?.error || 'Unable to save uploaded files.')
  }

  return Array.isArray(completeData?.photos) ? (completeData.photos as PortalPhoto[]) : []
}

async function uploadPortalFileWithFallback(folderId: string, file: File): Promise<PortalPhoto> {
  try {
    return await uploadPortalFileDirect(folderId, file)
  } catch (error) {
    if (shouldFallbackToServerUpload(error) || isDirectStorageUploadError(error)) {
      return uploadMediaFileViaServer(folderId, file)
    }
    throw error
  }
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
  const [folderManageOpen, setFolderManageOpen] = useState(false)
  const [deletingFolder, setDeletingFolder] = useState(false)
  const [confirmDeletePhotoId, setConfirmDeletePhotoId] = useState<string | null>(null)
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [foldersPanelOpen, setFoldersPanelOpen] = useState(false)
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

  useEffect(() => {
    setFolderManageOpen(false)
    setLinkCopied(false)
  }, [selectedFolderId])

  function handleFolderSelect(id: string) {
    setSelectedFolderId(id)
    setFoldersPanelOpen(false)
  }

  async function copySelectedFolderLink() {
    if (!selectedFolderId) return

    const url = buildFolderShareUrl(selectedFolderId)
    try {
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
      window.setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      setError('Unable to copy link.')
    }
  }

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
    let refreshFolderId: string | null = null
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
      const uploadQueue = [...filesToUpload]
      let completedCount = 0
      const finishedFileKeys = new Set<string>()

      const fileProgressKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`

      const finishFileProgress = (file: File) => {
        const key = fileProgressKey(file)
        if (finishedFileKeys.has(key)) return
        finishedFileKeys.add(key)
        completedCount += 1
        setUploadProgress({
          current: completedCount,
          total: uploadQueue.length,
          name: file.name,
        })
      }

      const setActiveFile = (file: File) => {
        setUploadProgress({
          current: completedCount,
          total: uploadQueue.length,
          name: file.name,
        })
      }

      const mergePhotos = (nextPhotos: PortalPhoto[]) => {
        if (nextPhotos.length === 0) return
        uploadedCount += nextPhotos.length
        setPhotos((current) => {
          const incomingIds = new Set(nextPhotos.map((photo) => photo.id))
          return [...nextPhotos, ...current.filter((photo) => !incomingIds.has(photo.id))]
        })
      }

      const uploadOne = async (file: File) => {
        setActiveFile(file)
        try {
          mergePhotos([await uploadPortalFileResolved(selectedFolderId, file)])
        } catch (error) {
          failures.push(
            `${file.name}: ${error instanceof Error ? error.message : 'Upload failed.'}`,
          )
        } finally {
          finishFileProgress(file)
        }
      }

      const uploadConcurrency = getPortalUploadConcurrency()
      const presignBatchSize = getPortalPresignBatchSize()
      const useServerUploadOnly =
        prefersPortalServerUpload() &&
        uploadQueue.every((file) => shouldPortalFileUseServerUploadFirst(file))

      if (useServerUploadOnly) {
        await runWithConcurrency(uploadQueue, uploadConcurrency, async (file) => {
          await uploadOne(file)
        })
      } else {
      for (let offset = 0; offset < uploadQueue.length; offset += presignBatchSize) {
        const batch = uploadQueue.slice(offset, offset + presignBatchSize)
        let batchStorageDone = 0

        const reportStorageProgress = (file: File) => {
          batchStorageDone += 1
          setUploadProgress({
            current: completedCount + batchStorageDone,
            total: uploadQueue.length,
            name: file.name,
          })
        }

        try {
          const presigns = await presignPortalFiles(selectedFolderId, batch)
          const jobs = batch.map((file, index) => ({ file, upload: presigns[index] }))
          const readyToComplete: Array<{
            file: File
            multipart: CompletedMultipartUpload | null
            upload: PresignedPortalUpload
          }> = []
          const storageFailed: File[] = []

          await runWithConcurrency(jobs, uploadConcurrency, async ({ file, upload }) => {
            if (shouldPortalFileUseServerUploadFirst(file)) {
              storageFailed.push(file)
              return
            }

            setActiveFile(file)
            try {
              readyToComplete.push({
                file,
                upload,
                multipart: await uploadFileToStorage(file, upload),
              })
              reportStorageProgress(file)
            } catch (error) {
              if (canPortalFileUseServerUpload(file)) {
                storageFailed.push(file)
              } else {
                failures.push(
                  `${file.name}: ${error instanceof Error ? error.message : 'Upload failed.'}`,
                )
                finishFileProgress(file)
              }
            }
          })

          const batchCompletedKeys = new Set<string>()

          if (readyToComplete.length > 0) {
            try {
              mergePhotos(await completePresignedPortalBatch(selectedFolderId, readyToComplete))
              for (const item of readyToComplete) {
                batchCompletedKeys.add(fileProgressKey(item.file))
                finishFileProgress(item.file)
              }
            } catch (error) {
              for (const item of readyToComplete) {
                storageFailed.push(item.file)
                if (readyToComplete.length === 1) {
                  failures.push(
                    `${item.file.name}: ${error instanceof Error ? error.message : 'Upload failed.'}`,
                  )
                }
              }
              if (readyToComplete.length > 1) {
                failures.push(
                  error instanceof Error ? error.message : 'Some files could not be saved after upload.',
                )
              }
            }
          }

          if (storageFailed.length > 0) {
            await runWithConcurrency(storageFailed, uploadConcurrency, async (file) => {
              if (batchCompletedKeys.has(fileProgressKey(file))) return

              setActiveFile(file)
              try {
                mergePhotos([await uploadMediaFileViaServer(selectedFolderId, file)])
              } catch (error) {
                failures.push(
                  `${file.name}: ${error instanceof Error ? error.message : 'Upload failed.'}`,
                )
              } finally {
                finishFileProgress(file)
              }
            })
          }
        } catch {
          await runWithConcurrency(batch, uploadConcurrency, async (file) => {
            await uploadOne(file)
          })
        }
      }
      }

      if (uploadedCount > 0) {
        setFiles([])
        setSelectedPreviews([])
        refreshFolderId = selectedFolderId
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

    if (refreshFolderId) {
      void Promise.all([loadPhotos(refreshFolderId), loadFolders()]).catch((e) => {
        setError(e instanceof Error ? e.message : 'Upload finished, but refreshing media failed.')
      })
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

  async function deleteSelectedFolder() {
    if (!selectedFolderId) return
    setError('')
    setSuccess('')
    setDeletingFolder(true)
    try {
      const parentId = selectedFolder?.parent_folder_id ?? null
      const res = await fetch(`/api/portals/photographers/folders/${selectedFolderId}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Unable to delete folder.')

      setFolderManageOpen(false)
      const nextFolders = await loadFolders()
      if (parentId && nextFolders.some((folder) => folder.id === parentId)) {
        setSelectedFolderId(parentId)
      } else {
        const root = nextFolders.find((folder) => !folder.parent_folder_id)
        setSelectedFolderId(root?.id ?? null)
      }
      setSuccess('Folder deleted.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to delete folder.')
    } finally {
      setDeletingFolder(false)
    }
  }

  async function deletePhoto(photoId: string) {
    setError('')
    setSuccess('')
    setDeletingPhotoId(photoId)
    try {
      const res = await fetch(`/api/portals/photographers/photos/${photoId}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Unable to delete photo.')

      setConfirmDeletePhotoId(null)
      setPhotos((current) => {
        const nextPhotos = current.filter((photo) => photo.id !== photoId)
        setLightboxIndex((lightbox) => {
          if (lightbox == null) return lightbox
          if (nextPhotos.length === 0) return null
          const deletedIndex = current.findIndex((photo) => photo.id === photoId)
          if (deletedIndex >= 0 && lightbox > deletedIndex) return lightbox - 1
          if (lightbox >= nextPhotos.length) return nextPhotos.length - 1
          return lightbox
        })
        return nextPhotos
      })
      await loadFolders()
      setSuccess('Photo deleted.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to delete photo.')
    } finally {
      setDeletingPhotoId(null)
    }
  }

  const uploadPercent = uploadProgress
    ? uploadProgress.total > 0
      ? Math.min(
          100,
          Math.round((uploadProgress.current / uploadProgress.total) * 100),
        )
      : 0
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

      <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/75 shadow-[0_20px_60px_-12px_rgba(16,35,63,0.12)] backdrop-blur-sm sm:rounded-[1.75rem]">
        <div className="grid lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside
            className={`border-b border-slate-100/80 bg-gradient-to-b from-[#faf8f6] to-white p-4 sm:p-5 lg:border-b-0 lg:border-r ${
              foldersPanelOpen ? 'block' : 'hidden lg:block'
            }`}
          >
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
                onSelect={handleFolderSelect}
                selectedId={selectedFolderId}
                variant="photographer"
              />
            )}
          </aside>

          <div className="min-h-[420px] bg-gradient-to-br from-white via-white to-slate-50/60 p-4 sm:min-h-[520px] sm:p-6 lg:p-8">
            <button
              className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-[#10233f] shadow-sm transition hover:bg-slate-50 lg:hidden"
              onClick={() => setFoldersPanelOpen((open) => !open)}
              type="button"
            >
              <PanelLeft className="h-4 w-4 shrink-0" />
              {foldersPanelOpen ? 'Hide folders' : 'Browse folders'}
              {selectedFolder ? (
                <span className="truncate text-slate-500">· {selectedFolder.folder_name}</span>
              ) : null}
            </button>

          {!selectedFolder ? (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-slate-200/80 bg-white/50 px-6 py-12 text-center sm:min-h-[360px]">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#c6603d]/10 text-[#c6603d]">
                <FolderPlus className="h-7 w-7" />
              </div>
              <p className="text-lg font-semibold text-[#10233f]">Select a folder to continue</p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                Pick a main folder to manage sub-folders, or open a sub-folder to upload photos and videos.
              </p>
              <button
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#c6603d] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#c6603d]/20 transition hover:bg-[#ae5536] lg:hidden"
                onClick={() => setFoldersPanelOpen(true)}
                type="button"
              >
                <PanelLeft className="h-4 w-4" />
                Browse folders
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-4 border-b border-slate-100/90 pb-5">
                {isSubFolder && parentFolder ? (
                  <button
                    className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-200/70 hover:text-[#10233f]"
                    onClick={() => setSelectedFolderId(parentFolder.id)}
                    type="button"
                  >
                    <ChevronLeft className="h-4 w-4 shrink-0" />
                    <span className="truncate">Back to {parentFolder.folder_name}</span>
                  </button>
                ) : null}
                <div className="min-w-0">
                  <span className="inline-flex rounded-full bg-[#10233f]/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#10233f]/70">
                    {isMainFolder ? 'Main folder' : 'Sub-folder'}
                  </span>
                  <h2 className="mt-2 break-words text-xl font-semibold tracking-tight text-[#10233f] sm:text-2xl">
                    {selectedFolder.folder_name}
                  </h2>
                </div>
                <div
                  className={`grid gap-2 ${
                    isMainFolder && !isCreatingChildFolder
                      ? 'grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap'
                      : 'grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap'
                  }`}
                >
                  <button
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-[#10233f] shadow-sm transition hover:bg-slate-50 lg:w-auto"
                    onClick={() => void copySelectedFolderLink()}
                    type="button"
                  >
                    {linkCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />}
                    {linkCopied ? 'Copied!' : 'Copy link'}
                  </button>
                  {isMainFolder && !isCreatingChildFolder ? (
                    <button
                      className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#10233f] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#10233f]/15 transition hover:bg-[#1a3354] lg:w-auto"
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
                  <button
                    className={`inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-[#10233f] shadow-sm transition hover:bg-slate-50 lg:w-auto ${
                      isMainFolder && !isCreatingChildFolder ? 'sm:col-span-2 lg:col-span-1' : ''
                    }`}
                    onClick={() => setFolderManageOpen(true)}
                    type="button"
                  >
                    <Settings2 className="h-4 w-4" />
                    Manage
                  </button>
                </div>
              </div>

              <Dialog onOpenChange={setFolderManageOpen} open={folderManageOpen}>
                <DialogContent className="rounded-2xl border-slate-200 sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-[#10233f]">Delete folder?</DialogTitle>
                    <DialogDescription>
                      {isMainFolder
                        ? `This will permanently delete "${selectedFolder.folder_name}", all of its sub-folders, and every photo inside them.`
                        : `This will permanently delete "${selectedFolder.folder_name}" and all photos inside it.`}{' '}
                      This cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="gap-2 sm:gap-2">
                    <button
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 sm:flex-none"
                      disabled={deletingFolder}
                      onClick={() => setFolderManageOpen(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60 sm:flex-none"
                      disabled={deletingFolder}
                      onClick={() => void deleteSelectedFolder()}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                      {deletingFolder ? 'Deleting…' : 'Delete folder'}
                    </button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

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
                              onClick={() => handleFolderSelect(folder.id)}
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
                    <div className="rounded-[1.5rem] border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
                      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-base font-semibold text-[#10233f]">Upload media</h3>
                        </div>
                        {files.length > 0 || uploading ? (
                          <button
                            className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#c6603d] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#c6603d]/20 transition hover:bg-[#ae5536] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
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
                          {formatMaxUploadLabel(MAX_VIDEO_UPLOAD_BYTES)} · Up to {PORTAL_UPLOAD_CONCURRENCY}{' '}
                          files upload at once
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
                              <div className="space-y-2 px-3 py-2">
                                <p className="truncate text-xs text-slate-600">
                                  {photo.original_file_name}
                                </p>
                                {confirmDeletePhotoId === photo.id ? (
                                  <div className="flex gap-2">
                                    <button
                                      className="inline-flex min-h-[32px] flex-1 items-center justify-center rounded-lg bg-red-600 px-2 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                                      disabled={deletingPhotoId === photo.id}
                                      onClick={() => void deletePhoto(photo.id)}
                                      type="button"
                                    >
                                      {deletingPhotoId === photo.id ? 'Deleting…' : 'Confirm'}
                                    </button>
                                    <button
                                      className="inline-flex min-h-[32px] flex-1 items-center justify-center rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600"
                                      disabled={deletingPhotoId === photo.id}
                                      onClick={() => setConfirmDeletePhotoId(null)}
                                      type="button"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-2 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                                    disabled={Boolean(deletingPhotoId)}
                                    onClick={() => setConfirmDeletePhotoId(photo.id)}
                                    type="button"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Delete
                                  </button>
                                )}
                              </div>
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
