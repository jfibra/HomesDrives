import type { BoundingBox, DetectedFace } from '@/lib/types/people'
import { FACE_EMBEDDING_DIMENSIONS } from '@/lib/types/people'
import { normalizeBoundingBox } from '@/lib/face-geometry'

const DEFAULT_INSIGHTFACE_API_URL = 'http://127.0.0.1:8000'

type InsightFaceApiFace = {
  embedding?: number[]
  bbox?: number[]
  bounding_box?: BoundingBox
  confidence?: number
}

type InsightFaceDetectResponse = {
  faces?: InsightFaceApiFace[]
  embedding?: number[]
  bbox?: number[]
  bounding_box?: BoundingBox
}

function getInsightFaceApiUrl() {
  return process.env.INSIGHTFACE_API_URL?.trim() || DEFAULT_INSIGHTFACE_API_URL
}

function mapApiFace(face: InsightFaceApiFace, imageWidth: number, imageHeight: number): DetectedFace | null {
  const embedding = Array.isArray(face.embedding) ? face.embedding : null
  if (!embedding || embedding.length !== FACE_EMBEDDING_DIMENSIONS) {
    return null
  }

  const bbox = face.bbox ?? (face.bounding_box
    ? [face.bounding_box.x, face.bounding_box.y, face.bounding_box.x + face.bounding_box.width, face.bounding_box.y + face.bounding_box.height]
    : null)

  if (!bbox || bbox.length < 4) {
    return null
  }

  const confidence = typeof face.confidence === 'number' ? face.confidence : null
  if (confidence != null && confidence < MIN_FACE_DETECTION_CONFIDENCE) {
    return null
  }

  return {
    embedding,
    bounding_box: normalizeBoundingBox(bbox, imageWidth, imageHeight),
    confidence: typeof face.confidence === 'number' ? face.confidence : undefined,
  }
}

const MIN_FACE_DETECTION_CONFIDENCE = Number.parseFloat(
  process.env.FACE_MIN_DETECTION_CONFIDENCE ?? '0.55',
)

async function postImageToInsightFace(path: string, imageBuffer: Buffer): Promise<InsightFaceDetectResponse> {
  const url = `${getInsightFaceApiUrl().replace(/\/$/, '')}${path}`
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
      text || `InsightFace API error (${response.status}). Is the face service running at ${getInsightFaceApiUrl()}?`,
    )
  }

  return (await response.json()) as InsightFaceDetectResponse
}

export async function detectFacesInImage(imageBuffer: Buffer): Promise<DetectedFace[]> {
  const sharp = (await import('sharp')).default
  const meta = await sharp(imageBuffer).metadata()
  const imageWidth = meta.width ?? 1
  const imageHeight = meta.height ?? 1

  const payload = await postImageToInsightFace('/detect', imageBuffer)
  const faces = Array.isArray(payload.faces) ? payload.faces : []

  return faces
    .map((face) => mapApiFace(face, imageWidth, imageHeight))
    .filter((face): face is DetectedFace => Boolean(face))
}

export async function embedFaceFromImage(imageBuffer: Buffer): Promise<DetectedFace> {
  const sharp = (await import('sharp')).default
  const meta = await sharp(imageBuffer).metadata()
  const imageWidth = meta.width ?? 1
  const imageHeight = meta.height ?? 1

  const payload = await postImageToInsightFace('/embed', imageBuffer)

  if (Array.isArray(payload.faces) && payload.faces.length > 0) {
    const mapped = mapApiFace(payload.faces[0], imageWidth, imageHeight)
    if (mapped) return mapped
  }

  if (Array.isArray(payload.embedding) && payload.embedding.length === FACE_EMBEDDING_DIMENSIONS) {
    const bbox = payload.bbox ?? [0, 0, imageWidth, imageHeight]
    return {
      embedding: payload.embedding,
      bounding_box: normalizeBoundingBox(bbox, imageWidth, imageHeight),
    }
  }

  throw new Error('No face detected in the uploaded image.')
}
