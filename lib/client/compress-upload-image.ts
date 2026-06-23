import { MAX_SERVER_PROXY_UPLOAD_BYTES } from '@/lib/photo-upload-limits'

/** Stay under Vercel's ~4.5 MB request cap with multipart overhead. */
export const CLIENT_TRANSPORT_MAX_BYTES = Math.floor(3.8 * 1024 * 1024)

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function readImageElement(file: File) {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error(`Unable to read image data for ${file.name}`))
      image.src = objectUrl
    })
    return image
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Re-encodes large photos in the browser so they fit through the server proxy upload path.
 * Direct S3 uploads should use the original file; this is only for server fallback.
 */
export async function compressImageForTransport(file: File): Promise<File> {
  if (file.size <= CLIENT_TRANSPORT_MAX_BYTES) {
    return file
  }

  const image = await readImageElement(file)
  let width = Math.max(1, image.naturalWidth || 1)
  let height = Math.max(1, image.naturalHeight || 1)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Unable to process this image in your browser.')
  }

  let bestBlob: Blob | null = null
  let quality = 0.96

  for (let resizeStep = 0; resizeStep < 8; resizeStep++) {
    canvas.width = width
    canvas.height = height
    ctx.drawImage(image, 0, 0, width, height)

    quality = 0.96
    for (let qualityStep = 0; qualityStep < 9; qualityStep++) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      )
      if (!blob) break
      bestBlob = blob
      if (blob.size <= CLIENT_TRANSPORT_MAX_BYTES) {
        return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`, {
          type: 'image/jpeg',
          lastModified: file.lastModified,
        })
      }
      quality -= 0.02
    }

    width = Math.max(1, Math.floor(width * 0.95))
    height = Math.max(1, Math.floor(height * 0.95))
  }

  if (bestBlob) {
    throw new Error(
      `"${file.name}" is too large for server upload (best compressed size: ${formatBytes(bestBlob.size)}). Try Wi‑Fi on a phone or desktop browser.`,
    )
  }

  throw new Error(`Unable to compress "${file.name}" for upload.`)
}

export function assertPortalFileFitsServerProxy(file: File) {
  if (file.size <= MAX_SERVER_PROXY_UPLOAD_BYTES) return

  throw new Error(
    `"${file.name}" is too large to upload through the server (${formatBytes(file.size)}). Use Wi‑Fi on a phone or desktop browser.`,
  )
}
