export type BoundingBox = {
  x: number
  y: number
  width: number
  height: number
}

export type Person = {
  id: string
  name: string
  cover_face_url: string | null
  photo_count: number
  created_at: string
}

export type Face = {
  id: string
  photo_id: string
  person_id: string
  embedding: number[] | null
  face_thumbnail_url: string | null
  bounding_box: BoundingBox
  created_at: string
}

export type PersonPhoto = {
  id: string
  image_url: string
  original_file_name: string
  width: number | null
  height: number | null
  created_at: string
}

export type DetectedFace = {
  embedding: number[]
  bounding_box: BoundingBox
  confidence?: number
}

export type FaceMatch = {
  face_id: string
  person_id: string
  photo_id: string
  similarity: number
}

export type PaginatedResult<T> = {
  items: T[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export type FaceSearchMatch = {
  person: Person
  similarity: number
}

export type FaceSearchResult = {
  person: Person | null
  photos: PersonPhoto[]
  bestSimilarity: number | null
  matches: FaceSearchMatch[]
  noFaceDetected?: boolean
}

export const FACE_EMBEDDING_DIMENSIONS = 512

function readFaceMatchThreshold() {
  const raw = process.env.FACE_MATCH_THRESHOLD?.trim()
  if (!raw) return 0.45
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1 ? parsed : 0.45
}

function readFaceMatchMargin() {
  const raw = process.env.FACE_MATCH_MARGIN?.trim()
  if (!raw) return 0.08
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) && parsed >= 0 && parsed < 1 ? parsed : 0.08
}

/** Cosine similarity threshold for grouping the same person (0.4–0.5 typical for ArcFace). */
export const FACE_MATCH_THRESHOLD = readFaceMatchThreshold()

/** Min gap between 1st and 2nd match; avoids merging when two people score similarly. */
export const FACE_MATCH_MARGIN = readFaceMatchMargin()
