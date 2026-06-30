import { createSupabaseAdminClient } from '@/lib/server/albums'
import type { BoundingBox, Face } from '@/lib/types/people'
import { FACE_EMBEDDING_DIMENSIONS } from '@/lib/types/people'
import { createPerson, refreshPersonPhotoCount, updatePersonCover } from '@/lib/people'
import { derivePersonNameFromFileName } from '@/lib/person-name-from-file'

const FACE_SELECT =
  'id, photo_id, person_id, embedding, face_thumbnail_url, bounding_box, created_at'

function mapBoundingBox(value: unknown): BoundingBox {
  if (!value || typeof value !== 'object') {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  const box = value as Record<string, unknown>
  return {
    x: Number(box.x) || 0,
    y: Number(box.y) || 0,
    width: Number(box.width) || 0,
    height: Number(box.height) || 0,
  }
}

function parseEmbedding(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => Number.isFinite(item))
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed)) {
        return parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item))
      }
    } catch {
      return null
    }
  }
  return null
}

function mapFace(row: Record<string, unknown>): Face {
  return {
    id: String(row.id),
    photo_id: String(row.photo_id),
    person_id: String(row.person_id),
    embedding: parseEmbedding(row.embedding),
    face_thumbnail_url:
      typeof row.face_thumbnail_url === 'string' && row.face_thumbnail_url.trim()
        ? row.face_thumbnail_url.trim()
        : null,
    bounding_box: mapBoundingBox(row.bounding_box),
    created_at: String(row.created_at ?? ''),
  }
}

function formatEmbeddingForPg(embedding: number[]): string {
  if (embedding.length !== FACE_EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding must be ${FACE_EMBEDDING_DIMENSIONS} dimensions.`)
  }
  return `[${embedding.join(',')}]`
}

export async function getFacesByPhotoId(photoId: string): Promise<Face[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from('faces').select(FACE_SELECT).eq('photo_id', photoId)

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => mapFace(row as Record<string, unknown>))
}

export async function detachPhotoFromPerson(params: {
  personId: string
  photoId: string
}): Promise<{ newPersonId: string; movedFaces: number }> {
  const supabase = createSupabaseAdminClient()
  const { data: faces, error } = await supabase
    .from('faces')
    .select('id, face_thumbnail_url')
    .eq('person_id', params.personId)
    .eq('photo_id', params.photoId)

  if (error) throw new Error(error.message)
  if (!faces?.length) {
    throw new Error('No face link found for this photo and person.')
  }

  const coverFaceUrl =
    typeof faces[0].face_thumbnail_url === 'string' && faces[0].face_thumbnail_url.trim()
      ? faces[0].face_thumbnail_url.trim()
      : null

  const { data: photoRow } = await supabase
    .from('albums_photos')
    .select('original_file_name')
    .eq('id', params.photoId)
    .maybeSingle()

  const derivedName =
    typeof photoRow?.original_file_name === 'string'
      ? derivePersonNameFromFileName(photoRow.original_file_name)
      : null

  const newPerson = await createPerson({
    coverFaceUrl,
    name: derivedName ?? undefined,
  })

  const { error: updateError } = await supabase
    .from('faces')
    .update({ person_id: newPerson.id })
    .eq('person_id', params.personId)
    .eq('photo_id', params.photoId)

  if (updateError) throw new Error(updateError.message)

  await refreshPersonPhotoCount(params.personId)
  await refreshPersonPhotoCount(newPerson.id)

  return { newPersonId: newPerson.id, movedFaces: faces.length }
}

export async function detachPhotosFromPerson(params: {
  personId: string
  photoIds: string[]
}): Promise<{ detached: number; movedFaces: number; newPersonIds: string[] }> {
  const uniquePhotoIds = [...new Set(params.photoIds.map((id) => id.trim()).filter(Boolean))]
  if (uniquePhotoIds.length === 0) {
    throw new Error('Select at least one photo.')
  }

  const newPersonIds: string[] = []
  let movedFaces = 0

  for (const photoId of uniquePhotoIds) {
    const result = await detachPhotoFromPerson({ personId: params.personId, photoId })
    newPersonIds.push(result.newPersonId)
    movedFaces += result.movedFaces
  }

  return {
    detached: uniquePhotoIds.length,
    movedFaces,
    newPersonIds,
  }
}

export async function removePhotosFromPerson(params: {
  personId: string
  photoIds: string[]
}): Promise<{ removedPhotos: number; removedFaces: number }> {
  const uniquePhotoIds = [...new Set(params.photoIds.map((id) => id.trim()).filter(Boolean))]
  if (uniquePhotoIds.length === 0) {
    throw new Error('Select at least one photo.')
  }

  const supabase = createSupabaseAdminClient()
  const { data: faces, error: selectError } = await supabase
    .from('faces')
    .select('id')
    .eq('person_id', params.personId)
    .in('photo_id', uniquePhotoIds)

  if (selectError) throw new Error(selectError.message)

  const faceIds = (faces ?? []).map((row) => String(row.id))
  if (faceIds.length === 0) {
    throw new Error('No face detections found for the selected photos.')
  }

  const { error: deleteError } = await supabase.from('faces').delete().in('id', faceIds)
  if (deleteError) throw new Error(deleteError.message)

  await refreshPersonPhotoCount(params.personId)

  return {
    removedPhotos: uniquePhotoIds.length,
    removedFaces: faceIds.length,
  }
}

export async function deleteFacesForPhoto(photoId: string): Promise<void> {
  const supabase = createSupabaseAdminClient()

  const { data: existing, error: selectError } = await supabase
    .from('faces')
    .select('person_id')
    .eq('photo_id', photoId)

  if (selectError) throw new Error(selectError.message)

  const personIds = [...new Set((existing ?? []).map((row) => String(row.person_id)))]

  const { error: deleteError } = await supabase.from('faces').delete().eq('photo_id', photoId)
  if (deleteError) throw new Error(deleteError.message)

  await Promise.all(personIds.map((personId) => refreshPersonPhotoCount(personId)))
}

export async function insertFace(params: {
  photoId: string
  personId: string
  embedding: number[]
  faceThumbnailUrl: string | null
  boundingBox: BoundingBox
}): Promise<Face> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('faces')
    .insert({
      photo_id: params.photoId,
      person_id: params.personId,
      embedding: formatEmbeddingForPg(params.embedding),
      face_thumbnail_url: params.faceThumbnailUrl,
      bounding_box: params.boundingBox,
    })
    .select(FACE_SELECT)
    .single()

  if (error) throw new Error(error.message)

  await refreshPersonPhotoCount(params.personId)

  const personFaces = await getFacesByPersonId(params.personId)
  if (personFaces.length === 1 && params.faceThumbnailUrl) {
    await updatePersonCover(params.personId, params.faceThumbnailUrl)
  }

  return mapFace(data as Record<string, unknown>)
}

export async function getFacesByPersonId(personId: string): Promise<Face[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('faces')
    .select(FACE_SELECT)
    .eq('person_id', personId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => mapFace(row as Record<string, unknown>))
}
