import { compressImageForTransport } from '@/lib/client/compress-upload-image'
import {
  MAX_SERVER_PROXY_UPLOAD_BYTES,
  PORTAL_PRESIGN_BATCH_SIZE,
  PORTAL_UPLOAD_CONCURRENCY,
} from '@/lib/photo-upload-limits'
import { inferPortalContentType, isPortalImageFile, isPortalFileOverUploadLimit, formatPortalUploadLimitLabel } from '@/lib/portals/upload-file-utils'

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
  return isMobilePortalUploadClient() ? 3 : PORTAL_UPLOAD_CONCURRENCY
}

export function getPortalPresignBatchSize() {
  return PORTAL_PRESIGN_BATCH_SIZE
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
  return file.size <= MAX_SERVER_PROXY_UPLOAD_BYTES
}

/** Always use presigned direct-to-S3 first; server proxy is fallback only for small files. */
export function shouldPortalFileUseServerUploadFirst(_file: File) {
  return false
}

export async function preparePortalFileForServerUpload(file: File): Promise<File> {
  if (isPortalFileOverUploadLimit(file)) {
    const contentType = inferPortalContentType(file.name, file.type)
    throw new Error(
      `"${file.name}" exceeds the ${formatPortalUploadLimitLabel(file.name, contentType)} limit.`,
    )
  }

  if (canPortalFileUseServerUpload(file)) {
    return file
  }

  const contentType = inferPortalContentType(file.name, file.type)
  if (!isPortalImageFile(file.name, contentType)) {
    throw new Error(
      `"${file.name}" is too large for server upload. Direct storage upload failed — try Wi‑Fi or a desktop browser.`,
    )
  }

  return compressImageForTransport(file)
}
