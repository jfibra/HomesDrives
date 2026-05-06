import sharp from 'sharp'

import { TARGET_STORED_PHOTO_BYTES } from '@/lib/photo-upload-limits'

export type CompressedPhotoResult = {
  buffer: Buffer
  width: number
  height: number
}

/**
 * Rewrites the image as a JPEG tuned toward TARGET_STORED_PHOTO_BYTES (~10 KB).
 * Applies resize + quality steps so large uploads (up to 10 MB before this runs)
 * shrink drastically for storage while staying recognizable at thumbnail sizes.
 */
export async function compressPhotoForAlbumStorage(input: Buffer): Promise<CompressedPhotoResult> {
  const target = TARGET_STORED_PHOTO_BYTES

  const meta = await sharp(input).metadata()
  const origW = meta.width ?? 1
  const origH = meta.height ?? 1
  const origMax = Math.max(origW, origH)

  async function encode(maxEdge: number, quality: number) {
    return sharp(input)
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({
        quality,
        mozjpeg: true,
        chromaSubsampling: '4:2:0',
      })
      .toBuffer()
  }

  let maxEdge = Math.min(1600, Math.max(origMax, 320))
  let quality = 78

  for (let attempt = 0; attempt < 30; attempt++) {
    const buf = await encode(maxEdge, quality)

    if (buf.length <= target) {
      const outMeta = await sharp(buf).metadata()
      return {
        buffer: buf,
        width: outMeta.width ?? origW,
        height: outMeta.height ?? origH,
      }
    }

    if (quality > 34) {
      quality -= 5
    } else if (maxEdge > 160) {
      maxEdge = Math.floor(maxEdge * 0.72)
      quality = Math.min(quality + 3, 72)
    } else {
      break
    }
  }

  const tiny = await sharp(input)
    .rotate()
    .resize({ width: 260, height: 260, fit: 'inside', withoutEnlargement: true })
    .jpeg({
      quality: 28,
      mozjpeg: true,
      chromaSubsampling: '4:2:0',
    })
    .toBuffer()

  const tinyMeta = await sharp(tiny).metadata()
  return {
    buffer: tiny,
    width: tinyMeta.width ?? origW,
    height: tinyMeta.height ?? origH,
  }
}

export async function compressAvatarImage(input: Buffer): Promise<{ buffer: Buffer }> {
  const buf = await sharp(input)
    .rotate()
    .resize(512, 512, {
      fit: 'cover',
      position: 'centre',
    })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer()
  return { buffer: Buffer.from(buf) }
}

/** Storage filename: same base name as upload, extension `.jpg`. */
export function storageJpegFileName(originalFileName: string): string {
  const trimmed = originalFileName.trim() || 'photo'
  const lastSlash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  const base = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const safeStem = stem.replace(/[^\w\- ().[\]]+/g, '_').slice(0, 120) || 'photo'
  return `${safeStem}.jpg`
}
