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

const MIN_FACE_CROP_SHARPNESS = Number.parseFloat(process.env.FACE_MIN_CROP_SHARPNESS ?? '120')
const MIN_FACE_CROP_EDGE_PX = Number.parseInt(process.env.FACE_MIN_CROP_EDGE_PX ?? '80', 10)

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

  if (sharpness < MIN_FACE_CROP_SHARPNESS) {
    return {
      ok: false,
      sharpness,
      width,
      height,
      reason: 'Face crop is too blurry.',
    }
  }

  return { ok: true, sharpness, width, height }
}
