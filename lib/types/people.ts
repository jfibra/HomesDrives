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
  /** When true, grid preview uses the manually chosen cover and skips auto best-face. */
  cover_locked: boolean
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
  /** Detector score (InsightFace SCRFD); higher = clearer / more certain face. */
  confidence: number | null
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

export type PhotoFaceAnnotation = {
  face_id: string
  person_id: string
  person_name: string
  face_thumbnail_url: string | null
  bounding_box: BoundingBox
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

function readFaceLinkThreshold() {
  const raw = process.env.FACE_LINK_THRESHOLD?.trim() ?? process.env.FACE_MATCH_THRESHOLD?.trim()
  if (!raw) return 0.42
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1 ? parsed : 0.42
}

function readFaceMatchThreshold() {
  return readFaceLinkThreshold()
}

function readFaceMatchMargin() {
  const raw = process.env.FACE_MATCH_MARGIN?.trim()
  if (!raw) return 0.06
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) && parsed >= 0 && parsed < 1 ? parsed : 0.06
}

/** Cosine similarity to link a face to an existing person (lower = more photos linked). */
export const FACE_LINK_THRESHOLD = readFaceLinkThreshold()

/** @deprecated Use FACE_LINK_THRESHOLD */
export const FACE_MATCH_THRESHOLD = readFaceMatchThreshold()

/** Min gap between 1st and 2nd match; skip when two different people score too similarly. */
export const FACE_MATCH_MARGIN = readFaceMatchMargin()

/** Detector confidence required before inventing a brand-new person. */
export const FACE_CREATE_MIN_CONFIDENCE = Number.parseFloat(
  process.env.FACE_CREATE_MIN_CONFIDENCE ?? '0.68',
)

/** Slightly lower threshold when actively searching for a known person in more photos. */
export const FACE_FIND_MORE_THRESHOLD = Number.parseFloat(
  process.env.FACE_FIND_MORE_THRESHOLD ?? '0.45',
)
