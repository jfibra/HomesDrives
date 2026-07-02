export const BUILDING_EMBEDDING_DIMENSIONS = 512

/** Final similarity required after multi-view + margin filtering (0–1). */
export const BUILDING_MATCH_THRESHOLD = Number.parseFloat(process.env.BUILDING_MATCH_THRESHOLD ?? '0.78')

/** DB candidate retrieval threshold (looser — refined in app layer). */
export const BUILDING_MATCH_DB_THRESHOLD = Number.parseFloat(process.env.BUILDING_MATCH_DB_THRESHOLD ?? '0.65')

/** Minimum gap between #1 and #2 match to avoid ambiguous buildings. */
export const BUILDING_MATCH_MIN_MARGIN = Number.parseFloat(process.env.BUILDING_MATCH_MIN_MARGIN ?? '0.04')

/** High-confidence auto-match threshold. */
export const BUILDING_HIGH_CONFIDENCE_THRESHOLD = Number.parseFloat(
  process.env.BUILDING_HIGH_CONFIDENCE_THRESHOLD ?? '0.85',
)

/** GPS radius when scan location is available (km). */
export const BUILDING_GPS_RADIUS_KM = Number.parseFloat(process.env.BUILDING_GPS_RADIUS_KM ?? '3')

export type BuildingListing = {
  title: string
  price?: string | null
  beds?: number | null
  baths?: number | null
  description?: string | null
}

export const MAX_BUILDING_REFERENCE_PHOTOS = 12

export type Building = {
  id: string
  name: string
  description: string | null
  full_address: string | null
  latitude: number | null
  longitude: number | null
  listings: BuildingListing[]
  cover_image_url: string | null
  reference_photo_count: number
  created_at: string
  updated_at: string
}

export type BuildingMatchConfidence = 'high' | 'medium' | 'low'

export type BuildingMatch = {
  building: Building
  similarity: number
  confidence: BuildingMatchConfidence
}

export type BuildingRecognitionResult = {
  matches: BuildingMatch[]
  bestSimilarity: number | null
  building: Building | null
  ambiguous: boolean
  lowQualityImage: boolean
  qualityMessage: string | null
  usedGpsFilter: boolean
}

export type BuildingReferencePhoto = {
  id: string
  image_url: string | null
  created_at: string
}

export type BuildingWithPhotos = Building & {
  reference_photos: BuildingReferencePhoto[]
}

export type BuildingRegisterInput = {
  name: string
  description?: string | null
  fullAddress?: string | null
  latitude?: number | null
  longitude?: number | null
  listings?: BuildingListing[]
}

export function getMatchConfidence(similarity: number): BuildingMatchConfidence {
  if (similarity >= BUILDING_HIGH_CONFIDENCE_THRESHOLD) return 'high'
  if (similarity >= BUILDING_MATCH_THRESHOLD) return 'medium'
  return 'low'
}
