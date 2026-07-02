import {
  BUILDING_EMBEDDING_DIMENSIONS,
  BUILDING_GPS_RADIUS_KM,
  BUILDING_HIGH_CONFIDENCE_THRESHOLD,
  BUILDING_MATCH_DB_THRESHOLD,
  BUILDING_MATCH_MIN_MARGIN,
  BUILDING_MATCH_THRESHOLD,
  getMatchConfidence,
} from '@/lib/types/buildings'

const DEFAULT_VISION_API_URL = 'http://127.0.0.1:8000'

export type BuildingImageQuality = {
  ok: boolean
  sharpness: number
  brightness: number
  message: string | null
}

export type BuildingEmbedResult = {
  embedding: number[]
  viewEmbeddings: number[][]
  quality: BuildingImageQuality
}

type BuildingEmbedResponse = {
  embedding?: number[]
  view_embeddings?: number[][]
  quality?: {
    ok?: boolean
    sharpness?: number
    brightness?: number
    message?: string | null
  }
}

function getVisionApiUrl() {
  return (
    process.env.VISION_API_URL?.trim() ||
    process.env.INSIGHTFACE_API_URL?.trim() ||
    DEFAULT_VISION_API_URL
  )
}

async function postImageToVisionApi(path: string, imageBuffer: Buffer): Promise<BuildingEmbedResponse> {
  const url = `${getVisionApiUrl().replace(/\/$/, '')}${path}`
  const formData = new FormData()
  formData.append(
    'file',
    new Blob([new Uint8Array(imageBuffer)], { type: 'image/jpeg' }),
    'photo.jpg',
  )

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(120_000),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      text || `Vision API error (${response.status}). Is the service running at ${getVisionApiUrl()}?`,
    )
  }

  return (await response.json()) as BuildingEmbedResponse
}

function parseEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== BUILDING_EMBEDDING_DIMENSIONS) return null
  return value.every((entry) => typeof entry === 'number') ? value : null
}

function parseQuality(payload: BuildingEmbedResponse): BuildingImageQuality {
  const quality = payload.quality
  return {
    ok: Boolean(quality?.ok ?? true),
    sharpness: typeof quality?.sharpness === 'number' ? quality.sharpness : 0,
    brightness: typeof quality?.brightness === 'number' ? quality.brightness : 0,
    message:
      typeof quality?.message === 'string' && quality.message.trim() ? quality.message.trim() : null,
  }
}

export async function embedBuildingFromImage(imageBuffer: Buffer): Promise<number[]> {
  const result = await embedBuildingWithViews(imageBuffer)
  return result.embedding
}

export async function embedBuildingWithViews(imageBuffer: Buffer): Promise<BuildingEmbedResult> {
  const payload = await postImageToVisionApi('/buildings/embed', imageBuffer)
  const embedding = parseEmbedding(payload.embedding)
  if (!embedding) {
    throw new Error('Unable to generate a building embedding from this image.')
  }

  const viewEmbeddings = Array.isArray(payload.view_embeddings)
    ? payload.view_embeddings
        .map((entry) => parseEmbedding(entry))
        .filter((entry): entry is number[] => Boolean(entry))
    : []

  return {
    embedding,
    viewEmbeddings: viewEmbeddings.length > 0 ? viewEmbeddings : [embedding],
    quality: parseQuality(payload),
  }
}

export function getVisionApiHealthUrl() {
  return `${getVisionApiUrl().replace(/\/$/, '')}/health`
}

export {
  BUILDING_GPS_RADIUS_KM,
  BUILDING_HIGH_CONFIDENCE_THRESHOLD,
  BUILDING_MATCH_DB_THRESHOLD,
  BUILDING_MATCH_MIN_MARGIN,
  BUILDING_MATCH_THRESHOLD,
  getMatchConfidence,
}
