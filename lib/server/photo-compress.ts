import sharp from 'sharp'

import { ALBUM_MAX_STORED_EDGE_PX, MAX_PHOTO_UPLOAD_BYTES } from '@/lib/photo-upload-limits'

export type CompressedPhotoResult = {
  buffer: Buffer
  width: number
  height: number
}

const ALBUM_JPEG_QUALITY_INITIAL = 92
const ALBUM_JPEG_QUALITY_MIN = 78

/**
 * Normalizes album photos for storage: EXIF orientation, optional downscale beyond
 * ALBUM_MAX_STORED_EDGE_PX, then high-quality JPEG. Output is capped by MAX_PHOTO_UPLOAD_BYTES.
 */
export async function compressPhotoForAlbumStorage(input: Buffer): Promise<CompressedPhotoResult> {
  const meta = await sharp(input).metadata()
  const origW = meta.width ?? 1
  const origH = meta.height ?? 1
  const origMax = Math.max(origW, origH)

  async function encodeAtQuality(quality: number, maxEdge: number) {
    let p = sharp(input).rotate()
    if (maxEdge < origMax) {
      p = p.resize(maxEdge, maxEdge, {
        fit: 'inside',
        withoutEnlargement: true,
      })
    }
    return p
      .jpeg({
        quality,
        mozjpeg: true,
        chromaSubsampling: '4:4:4',
      })
      .toBuffer()
  }

  const initialMaxEdge =
    origMax > ALBUM_MAX_STORED_EDGE_PX ? ALBUM_MAX_STORED_EDGE_PX : origMax

  let quality = ALBUM_JPEG_QUALITY_INITIAL
  let buf: Buffer

  for (;;) {
    buf = await encodeAtQuality(quality, initialMaxEdge)

    if (buf.length <= MAX_PHOTO_UPLOAD_BYTES || quality <= ALBUM_JPEG_QUALITY_MIN) {
      break
    }
    quality -= 2
  }

  if (buf.length > MAX_PHOTO_UPLOAD_BYTES) {
    let maxEdge = Math.min(ALBUM_MAX_STORED_EDGE_PX, Math.max(origMax, 640))

    for (let step = 0; step < 20 && buf.length > MAX_PHOTO_UPLOAD_BYTES; step++) {
      maxEdge = Math.floor(maxEdge * 0.88)
      buf = await sharp(input)
        .rotate()
        .resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true })
        .jpeg({
          quality: ALBUM_JPEG_QUALITY_MIN,
          mozjpeg: true,
          chromaSubsampling: '4:2:0',
        })
        .toBuffer()
    }

    if (buf.length > MAX_PHOTO_UPLOAD_BYTES) {
      throw new Error('This image is too large to store after processing. Try a smaller file.')
    }
  }

  const outMeta = await sharp(buf).metadata()
  return {
    buffer: buf,
    width: outMeta.width ?? origW,
    height: outMeta.height ?? origH,
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

