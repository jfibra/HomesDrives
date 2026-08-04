/** Detect Apple HEIC/HEIF files that most browsers cannot display as <img>. */
export function isHeicLikeFile(file: File) {
  const type = file.type.toLowerCase()
  if (type === 'image/heic' || type === 'image/heif') return true
  return /\.hei[cf]$/i.test(file.name)
}

/** Accept image files even when MIME is missing (common for iPhone HEIC picks). */
export function isLikelyImageFile(file: File) {
  if (file.type.startsWith('image/')) return true
  if (/\.(jpe?g|png|gif|webp|bmp|hei[cf]|avif|tiff?)$/i.test(file.name)) return true
  return false
}

function jpegFileName(originalName: string) {
  const base = originalName.replace(/\.[^.]+$/, '').trim() || 'photo'
  return `${base}.jpg`
}

async function convertViaCanvas(file: File): Promise<File | null> {
  try {
    if (typeof createImageBitmap === 'undefined') return null
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, bitmap.width)
    canvas.height = Math.max(1, bitmap.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return null
    }
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92),
    )
    if (!blob) return null

    return new File([blob], jpegFileName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    })
  } catch {
    return null
  }
}

/**
 * Convert HEIC/HEIF to JPEG so photos display in Chrome/Firefox/Windows.
 * Non-HEIC files are returned unchanged.
 */
export async function normalizeImageFileForWebDisplay(file: File): Promise<File> {
  if (!isHeicLikeFile(file)) return file

  const viaCanvas = await convertViaCanvas(file)
  if (viaCanvas) return viaCanvas

  try {
    const heic2any = (await import('heic2any')).default as (options: {
      blob: Blob
      toType?: string
      quality?: number
    }) => Promise<Blob | Blob[]>

    const result = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92,
    })
    const blob = Array.isArray(result) ? result[0] : result
    if (!blob) {
      throw new Error('HEIC conversion returned an empty image.')
    }

    return new File([blob], jpegFileName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown conversion error'
    throw new Error(
      `"${file.name}" is an HEIC photo and could not be converted for web display (${detail}). Open it in Photos and export as JPEG, then upload again.`,
    )
  }
}
