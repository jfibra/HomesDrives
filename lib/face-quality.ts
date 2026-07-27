/** Laplacian variance on a greyscale face crop — higher = sharper. */
export function laplacianVariance(gray: Uint8Array, width: number, height: number): number {
  if (width < 3 || height < 3 || gray.length < width * height) return 0

  let sum = 0
  let sumSq = 0
  let count = 0

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const value =
        -4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width]
      sum += value
      sumSq += value * value
      count += 1
    }
  }

  if (count === 0) return 0
  const mean = sum / count
  return sumSq / count - mean * mean
}

const MIN_FACE_CROP_SHARPNESS = Number.parseFloat(process.env.FACE_MIN_CROP_SHARPNESS ?? '140')
const MIN_FACE_CROP_EDGE_PX = Number.parseInt(process.env.FACE_MIN_CROP_EDGE_PX ?? '88', 10)
const MIN_FACE_EYE_BAND_STD = Number.parseFloat(process.env.FACE_MIN_EYE_BAND_STD ?? '14')

function regionStd(gray: Uint8Array, width: number, x0: number, y0: number, x1: number, y1: number) {
  const left = Math.max(0, Math.min(width - 1, Math.floor(x0)))
  const right = Math.max(left + 1, Math.min(width, Math.ceil(x1)))
  const top = Math.max(0, Math.floor(y0))
  const bottom = Math.max(top + 1, Math.ceil(y1))

  let sum = 0
  let sumSq = 0
  let count = 0
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const value = gray[y * width + x]
      sum += value
      sumSq += value * value
      count += 1
    }
  }
  if (count === 0) return 0
  const mean = sum / count
  return Math.sqrt(Math.max(0, sumSq / count - mean * mean))
}

function regionMean(gray: Uint8Array, width: number, x0: number, y0: number, x1: number, y1: number) {
  const left = Math.max(0, Math.min(width - 1, Math.floor(x0)))
  const right = Math.max(left + 1, Math.min(width, Math.ceil(x1)))
  const top = Math.max(0, Math.floor(y0))
  const bottom = Math.max(top + 1, Math.ceil(y1))

  let sum = 0
  let count = 0
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      sum += gray[y * width + x]
      count += 1
    }
  }
  return count === 0 ? 0 : sum / count
}

/** Reject hand / body crops that are far from a square face box. */
export function isFaceBoundingBoxShapeOk(box: {
  width: number
  height: number
}): boolean {
  const width = Math.max(1, box.width)
  const height = Math.max(1, box.height)
  const ratio = width / height
  return ratio >= 0.75 && ratio <= 1.25
}

/**
 * Node-side second pass after InsightFace: sharp real faces only —
 * no blurry crops, tiny fragments, hands, or flat skin blobs.
 */
export async function isFaceCropAcceptable(cropBuffer: Buffer): Promise<{
  ok: boolean
  sharpness: number
  width: number
  height: number
  reason?: string
}> {
  const sharp = (await import('sharp')).default
  const { data, info } = await sharp(cropBuffer, { failOn: 'none' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const width = info.width ?? 0
  const height = info.height ?? 0
  const sharpness = laplacianVariance(data, width, height)

  if (width < MIN_FACE_CROP_EDGE_PX || height < MIN_FACE_CROP_EDGE_PX) {
    return {
      ok: false,
      sharpness,
      width,
      height,
      reason: 'Face crop is too small.',
    }
  }

  if (!isFaceBoundingBoxShapeOk({ width, height })) {
    return {
      ok: false,
      sharpness,
      width,
      height,
      reason: 'Crop shape does not look like a face.',
    }
  }

  if (sharpness < MIN_FACE_CROP_SHARPNESS) {
    return {
      ok: false,
      sharpness,
      width,
      height,
      reason: 'Face crop is too blurry.',
    }
  }

  // Eye band should have more structure than cheek / hand skin.
  const eyeStd = regionStd(data, width, width * 0.12, height * 0.18, width * 0.88, height * 0.42)
  const cheekStd = regionStd(data, width, width * 0.18, height * 0.55, width * 0.82, height * 0.82)
  if (eyeStd < MIN_FACE_EYE_BAND_STD) {
    return {
      ok: false,
      sharpness,
      width,
      height,
      reason: 'Crop lacks facial detail (likely hand or false positive).',
    }
  }
  if (eyeStd < cheekStd * 0.85) {
    return {
      ok: false,
      sharpness,
      width,
      height,
      reason: 'Crop texture does not look like a face.',
    }
  }

  const topMean = regionMean(data, width, 0, 0, width, height * 0.45)
  const bottomMean = regionMean(data, width, 0, height * 0.55, width, height)
  // Hands / flat objects often have a brighter top half than a real face.
  if (topMean >= bottomMean + 14) {
    return {
      ok: false,
      sharpness,
      width,
      height,
      reason: 'Crop lighting pattern does not look like a face.',
    }
  }

  return { ok: true, sharpness, width, height }
}
