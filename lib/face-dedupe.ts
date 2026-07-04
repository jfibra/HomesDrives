import type { BoundingBox, PhotoFaceAnnotation } from '@/lib/types/people'

export function boundingBoxArea(box: BoundingBox): number {
  return Math.max(0, box.width) * Math.max(0, box.height)
}

function boundingBoxIntersectionArea(a: BoundingBox, b: BoundingBox): number {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  const width = Math.max(0, right - left)
  const height = Math.max(0, bottom - top)
  return width * height
}

export function boundingBoxIoU(a: BoundingBox, b: BoundingBox): number {
  const intersection = boundingBoxIntersectionArea(a, b)
  const union = boundingBoxArea(a) + boundingBoxArea(b) - intersection
  return union > 0 ? intersection / union : 0
}

export function dedupeBySpatialOverlap<T extends { bounding_box: BoundingBox }>(
  items: T[],
  iouThreshold = 0.35,
): T[] {
  if (items.length <= 1) return items

  const sorted = [...items].sort(
    (a, b) => boundingBoxArea(b.bounding_box) - boundingBoxArea(a.bounding_box),
  )
  const kept: T[] = []

  for (const item of sorted) {
    const overlaps = kept.some(
      (other) => boundingBoxIoU(item.bounding_box, other.bounding_box) >= iouThreshold,
    )
    if (!overlaps) kept.push(item)
  }

  return kept
}

export function dedupePhotoFaceAnnotations(faces: PhotoFaceAnnotation[]): PhotoFaceAnnotation[] {
  if (faces.length <= 1) return faces

  const byPerson = new Map<string, PhotoFaceAnnotation>()
  for (const face of faces) {
    const existing = byPerson.get(face.person_id)
    if (!existing || boundingBoxArea(face.bounding_box) > boundingBoxArea(existing.bounding_box)) {
      byPerson.set(face.person_id, face)
    }
  }

  const uniquePeople = dedupeBySpatialOverlap([...byPerson.values()])

  return uniquePeople.sort(
    (a, b) => a.bounding_box.x - b.bounding_box.x || a.bounding_box.y - b.bounding_box.y,
  )
}
