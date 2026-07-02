/** Max edge for building photos sent through the Next.js API (matches server resize). */
const BUILDING_UPLOAD_MAX_EDGE = 1280

/** Keep each photo small so multiple angles fit in one multipart request (~4.5 MB cap). */
const BUILDING_PHOTO_TARGET_BYTES = 280 * 1024

/** Safe total for all photos in one register/update request (Vercel ~4.5 MB body limit). */
export const BUILDING_UPLOAD_BATCH_MAX_BYTES = 3.4 * 1024 * 1024

const BUILDING_IMAGE_EXTENSION = /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function isBuildingImageFile(file: File) {
  if (file.type.startsWith('image/')) return true
  if (BUILDING_IMAGE_EXTENSION.test(file.name)) return true
  // iOS camera/library picks sometimes omit MIME type and extension.
  if (!file.type && file.size > 0) return true
  return false
}

export function assertBuildingPhotoBatchFits(files: File[]) {
  const total = files.reduce((sum, file) => sum + file.size, 0)
  if (total <= BUILDING_UPLOAD_BATCH_MAX_BYTES) return

  throw new Error(
    `${files.length} photo${files.length === 1 ? '' : 's'} total ${formatBytes(total)} — too large to upload at once. Remove a photo or use the Camera button for smaller files.`,
  )
}

async function readImageElement(file: File) {
  if (typeof createImageBitmap !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0)
        bitmap.close()
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
        const image = new Image()
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve()
          image.onerror = () => reject(new Error(`Unable to read "${file.name}".`))
          image.src = dataUrl
        })
        return image
      }
      bitmap.close()
    } catch {
      /* fall back to blob URL */
    }
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () =>
        reject(
          new Error(
            `Unable to read "${file.name}". On iPhone, try the Camera button instead of Photos, or use JPG/PNG.`,
          ),
        )
      image.src = objectUrl
    })
    return image
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Resize and re-encode building photos before upload.
 * iPhone library picks are often 5–15 MB HEIC files; several in one request exceed Vercel's body limit.
 */
export async function prepareBuildingPhotoForUpload(file: File): Promise<File> {
  const image = await readImageElement(file)
  let width = Math.max(1, image.naturalWidth || 1)
  let height = Math.max(1, image.naturalHeight || 1)

  const longest = Math.max(width, height)
  if (longest > BUILDING_UPLOAD_MAX_EDGE) {
    const scale = BUILDING_UPLOAD_MAX_EDGE / longest
    width = Math.max(1, Math.floor(width * scale))
    height = Math.max(1, Math.floor(height * scale))
  }

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Unable to process this image in your browser.')
  }

  let bestBlob: Blob | null = null
  let quality = 0.88

  for (let resizeStep = 0; resizeStep < 6; resizeStep++) {
    canvas.width = width
    canvas.height = height
    ctx.drawImage(image, 0, 0, width, height)

    quality = 0.88
    for (let qualityStep = 0; qualityStep < 8; qualityStep++) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      )
      if (!blob) break
      bestBlob = blob
      if (blob.size <= BUILDING_PHOTO_TARGET_BYTES) {
        return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'building'}.jpg`, {
          type: 'image/jpeg',
          lastModified: file.lastModified,
        })
      }
      quality -= 0.08
    }

    width = Math.max(1, Math.floor(width * 0.9))
    height = Math.max(1, Math.floor(height * 0.9))
  }

  if (bestBlob) {
    return new File([bestBlob], `${file.name.replace(/\.[^.]+$/, '') || 'building'}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    })
  }

  throw new Error(`Unable to prepare "${file.name}" for upload (${formatBytes(file.size)}).`)
}

export async function prepareBuildingPhotosForUpload(files: File[]) {
  return Promise.all(files.map((file) => prepareBuildingPhotoForUpload(file)))
}
