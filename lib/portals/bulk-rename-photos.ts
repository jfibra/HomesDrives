import type { PortalPhoto } from '@/lib/portals/types'

export function getPortalFileExtension(fileName: string) {
  const lastDot = fileName.lastIndexOf('.')
  if (lastDot <= 0) return ''
  return fileName.slice(lastDot).toLowerCase()
}

export function stripPortalFileExtension(fileName: string) {
  const extension = getPortalFileExtension(fileName)
  if (!extension) return fileName
  return fileName.slice(0, -extension.length)
}

export function sanitizePortalRenameBaseName(baseName: string) {
  return stripPortalFileExtension(baseName.trim()).replace(/[<>:"/\\|?*]/g, '').trim()
}

export function buildNumberedPortalFileName(baseName: string, index: number, extension: string) {
  const base = sanitizePortalRenameBaseName(baseName)
  if (!base) return ''
  const normalizedExtension = extension && !extension.startsWith('.') ? `.${extension}` : extension
  return `${base}-${index}${normalizedExtension}`
}

export function buildBulkPortalRenamePlan(
  baseName: string,
  photos: PortalPhoto[],
  startIndex = 1,
): Array<{ id: string; fileName: string }> {
  const base = sanitizePortalRenameBaseName(baseName)
  if (!base || photos.length === 0) return []

  return photos.map((photo, offset) => ({
    id: photo.id,
    fileName: buildNumberedPortalFileName(base, startIndex + offset, getPortalFileExtension(photo.original_file_name)),
  }))
}
