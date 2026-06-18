import {
  MULTIPART_VIDEO_THRESHOLD_BYTES,
  PORTAL_PRESIGN_BATCH_SIZE,
  PORTAL_UPLOAD_CONCURRENCY,
} from '@/lib/photo-upload-limits'

/** Phones/tablets — direct browser→S3 uploads often fail (CORS / "Load failed"). */
export function isMobilePortalUploadClient() {
  if (typeof window === 'undefined') return false

  const ua = navigator.userAgent
  return (
    /iPhone|iPad|iPod|Android|Mobile/i.test(ua) ||
    (navigator.maxTouchPoints > 1 && window.matchMedia('(max-width: 900px)').matches)
  )
}

export function prefersPortalServerUpload() {
  return isMobilePortalUploadClient()
}

export function getPortalUploadConcurrency() {
  return isMobilePortalUploadClient()
    ? Math.min(2, PORTAL_UPLOAD_CONCURRENCY)
    : PORTAL_UPLOAD_CONCURRENCY
}

export function getPortalPresignBatchSize() {
  return isMobilePortalUploadClient()
    ? Math.min(4, PORTAL_PRESIGN_BATCH_SIZE)
    : PORTAL_PRESIGN_BATCH_SIZE
}

/** Safari iOS uses "Load failed" instead of "Failed to fetch". */
export function isDirectStorageFetchError(error: unknown) {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase()
    return /failed to fetch|load failed|networkerror|network error|fetch/i.test(message)
  }

  return false
}

export function shouldFallbackPortalUploadToServer(error: unknown) {
  if (isDirectStorageFetchError(error)) return true
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  return /blocked by the browser|could not reach storage|cors|storage|load failed|failed to fetch/.test(
    message,
  )
}

export function canPortalFileUseServerUpload(file: File) {
  return file.size <= MULTIPART_VIDEO_THRESHOLD_BYTES
}

export function shouldPortalFileUseServerUploadFirst(file: File) {
  return prefersPortalServerUpload() && canPortalFileUseServerUpload(file)
}
