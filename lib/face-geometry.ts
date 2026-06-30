import type { BoundingBox } from '@/lib/types/people'

export function normalizeBoundingBox(
  bbox: number[] | BoundingBox,
  imageWidth: number,
  imageHeight: number,
): BoundingBox {
  if (Array.isArray(bbox) && bbox.length >= 4) {
    const [x1, y1, x2, y2] = bbox
    const x = Math.max(0, Math.min(x1, x2))
    const y = Math.max(0, Math.min(y1, y2))
    const width = Math.max(1, Math.max(x1, x2) - x)
    const height = Math.max(1, Math.max(y1, y2) - y)
    return {
      x: Math.min(x, Math.max(0, imageWidth - 1)),
      y: Math.min(y, Math.max(0, imageHeight - 1)),
      width: Math.min(width, imageWidth),
      height: Math.min(height, imageHeight),
    }
  }

  const box = bbox as BoundingBox
  return {
    x: Math.max(0, box.x),
    y: Math.max(0, box.y),
    width: Math.max(1, box.width),
    height: Math.max(1, box.height),
  }
}
