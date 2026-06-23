import { MAX_PHOTO_UPLOAD_BYTES, MAX_VIDEO_UPLOAD_BYTES } from '@/lib/photo-upload-limits'

const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|m4v|mkv|avi)$/i
const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif|tiff?)$/i

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.avif': 'image/avif',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
}

function getFileExtension(fileName: string) {
  const lastDot = fileName.lastIndexOf('.')
  if (lastDot <= 0) return ''
  return fileName.slice(lastDot).toLowerCase()
}

export function isPortalVideoFileName(fileName: string) {
  return VIDEO_EXTENSIONS.test(fileName)
}

export function isPortalImageFileName(fileName: string) {
  return IMAGE_EXTENSIONS.test(fileName)
}

export function isPortalVideoFile(fileName: string, contentType: string) {
  return contentType.toLowerCase().startsWith('video/') || isPortalVideoFileName(fileName)
}

export function isPortalImageFile(fileName: string, contentType: string) {
  return contentType.toLowerCase().startsWith('image/') || isPortalImageFileName(fileName)
}

export function isAllowedPortalUpload(fileName: string, contentType: string) {
  return isPortalVideoFile(fileName, contentType) || isPortalImageFile(fileName, contentType)
}

export function inferPortalContentType(fileName: string, contentType: string) {
  const normalized = contentType?.trim().toLowerCase()
  if (normalized && normalized !== 'application/octet-stream') {
    return contentType.trim()
  }

  const extension = getFileExtension(fileName)
  return EXTENSION_CONTENT_TYPES[extension] || 'application/octet-stream'
}

export function getPortalUploadMaxBytes(fileName: string, contentType: string) {
  return isPortalVideoFile(fileName, contentType) ? MAX_VIDEO_UPLOAD_BYTES : MAX_PHOTO_UPLOAD_BYTES
}

export function isPortalFileOverUploadLimit(file: File) {
  const contentType = inferPortalContentType(file.name, file.type)
  return file.size > getPortalUploadMaxBytes(file.name, contentType)
}

export function formatPortalUploadLimitLabel(fileName: string, contentType: string) {
  const maxBytes = getPortalUploadMaxBytes(fileName, contentType)
  if (maxBytes >= 1024 * 1024 * 1024 && maxBytes % (1024 * 1024 * 1024) === 0) {
    return `${maxBytes / (1024 * 1024 * 1024)} GB`
  }

  return `${maxBytes / (1024 * 1024)} MB`
}
