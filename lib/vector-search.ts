import { createSupabaseAdminClient } from '@/lib/server/albums'
import { createPerson, ensurePersonNameFromPhotoIfUnknown } from '@/lib/people'
import { derivePersonNameFromFileName } from '@/lib/person-name-from-file'
import { insertFace } from '@/lib/faces'
import type { BoundingBox, DetectedFace, FaceMatch } from '@/lib/types/people'
import { FACE_EMBEDDING_DIMENSIONS, FACE_MATCH_MARGIN, FACE_MATCH_THRESHOLD } from '@/lib/types/people'

export type MatchOrCreatePersonResult = {
  personId: string
  isNewPerson: boolean
  similarity: number | null
  matchedFaceId: string | null
}

function formatEmbeddingForRpc(embedding: number[]): string {
  if (embedding.length !== FACE_EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding must be ${FACE_EMBEDDING_DIMENSIONS} dimensions.`)
  }
  return `[${embedding.join(',')}]`
}

export async function findSimilarFaces(params: {
  embedding: number[]
  threshold?: number
  limit?: number
}): Promise<FaceMatch[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('match_faces', {
    query_embedding: formatEmbeddingForRpc(params.embedding),
    match_threshold: params.threshold ?? FACE_MATCH_THRESHOLD,
    match_count: params.limit ?? 5,
  })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row: Record<string, unknown>) => ({
    face_id: String(row.face_id),
    person_id: String(row.person_id),
    photo_id: String(row.photo_id),
    similarity: Number(row.similarity) || 0,
  }))
}

export async function findSimilarFacesForEvent(params: {
  eventId: string
  embedding: number[]
  threshold?: number
  limit?: number
}): Promise<FaceMatch[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('match_faces_for_event', {
    query_embedding: formatEmbeddingForRpc(params.embedding),
    p_event_id: params.eventId,
    match_threshold: params.threshold ?? FACE_MATCH_THRESHOLD,
    match_count: params.limit ?? 5,
  })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row: Record<string, unknown>) => ({
    face_id: String(row.face_id),
    person_id: String(row.person_id),
    photo_id: String(row.photo_id),
    similarity: Number(row.similarity) || 0,
  }))
}

export async function matchOrCreatePerson(params: {
  embedding: number[]
  eventId?: string | null
  threshold?: number
  suggestedName?: string | null
}): Promise<MatchOrCreatePersonResult> {
  const threshold = params.threshold ?? FACE_MATCH_THRESHOLD
  const suggestedName = params.suggestedName?.trim() || null
  const matches = params.eventId
    ? await findSimilarFacesForEvent({
        eventId: params.eventId,
        embedding: params.embedding,
        threshold,
        limit: 3,
      })
    : await findSimilarFaces({
        embedding: params.embedding,
        threshold,
        limit: 3,
      })

  if (matches.length === 0) {
    const person = await createPerson({ name: suggestedName ?? undefined })
    return {
      personId: person.id,
      isNewPerson: true,
      similarity: null,
      matchedFaceId: null,
    }
  }

  const best = matches[0]
  const second = matches[1]
  const isAmbiguous =
    second != null &&
    best.similarity - second.similarity < FACE_MATCH_MARGIN &&
    best.similarity < 0.58

  if (isAmbiguous) {
    const person = await createPerson({ name: suggestedName ?? undefined })
    return {
      personId: person.id,
      isNewPerson: true,
      similarity: null,
      matchedFaceId: null,
    }
  }

  return {
    personId: best.person_id,
    isNewPerson: false,
    similarity: best.similarity,
    matchedFaceId: best.face_id,
  }
}

export async function storeDetectedFace(params: {
  photoId: string
  detectedFace: DetectedFace
  eventId?: string | null
  faceThumbnailUrl: string | null
  threshold?: number
  originalFileName?: string | null
}): Promise<MatchOrCreatePersonResult & { faceId: string }> {
  const suggestedName = params.originalFileName
    ? derivePersonNameFromFileName(params.originalFileName)
    : null

  const match = await matchOrCreatePerson({
    embedding: params.detectedFace.embedding,
    eventId: params.eventId,
    threshold: params.threshold,
    suggestedName,
  })

  if (!match.isNewPerson && params.originalFileName) {
    await ensurePersonNameFromPhotoIfUnknown(match.personId, params.originalFileName)
  }

  const face = await insertFace({
    photoId: params.photoId,
    personId: match.personId,
    embedding: params.detectedFace.embedding,
    faceThumbnailUrl: params.faceThumbnailUrl,
    boundingBox: params.detectedFace.bounding_box,
  })

  return { ...match, faceId: face.id }
}
