import { createSupabaseAdminClient } from '@/lib/server/albums'
import { dedupePhotoFaceAnnotations } from '@/lib/face-dedupe'
import { refreshPersonCoverFromBestFace as refreshBestPersonCover } from '@/lib/face-cover'
import type { BoundingBox, Face, PhotoFaceAnnotation } from '@/lib/types/people'
import { FACE_EMBEDDING_DIMENSIONS } from '@/lib/types/people'
import { createPerson, refreshPersonPhotoCount } from '@/lib/people'
import { derivePersonNameFromFileName } from '@/lib/person-name-from-file'

const FACE_SELECT =
  'id, photo_id, person_id, embedding, face_thumbnail_url, bounding_box, detection_confidence, created_at'
const FACE_SELECT_LEGACY =
  'id, photo_id, person_id, embedding, face_thumbnail_url, bounding_box, created_at'

async function selectFaces(
  query: (select: string) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<Face[]> {
  const primary = await query(FACE_SELECT)
  if (!primary.error) {
    return (primary.data ?? []).map((row) => mapFace(row as Record<string, unknown>))
  }

  if (/detection_confidence/i.test(primary.error.message)) {
    const fallback = await query(FACE_SELECT_LEGACY)
    if (fallback.error) throw new Error(fallback.error.message)
    return (fallback.data ?? []).map((row) => mapFace(row as Record<string, unknown>))
  }

  throw new Error(primary.error.message)
}

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
  const confidenceRaw = row.detection_confidence ?? row.confidence
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
    confidence:
      typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw) ? confidenceRaw : null,
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
  return selectFaces((select) =>
    supabase.from('faces').select(select).eq('photo_id', photoId),
  )
}

export async function getPhotoFaceAnnotations(photoId: string): Promise<PhotoFaceAnnotation[]> {
  const faces = await getFacesByPhotoId(photoId)
  if (faces.length === 0) return []

  const supabase = createSupabaseAdminClient()
  const personIds = [...new Set(faces.map((face) => face.person_id))]
  const { data: people, error } = await supabase.from('people').select('id, name').in('id', personIds)

  if (error) throw new Error(error.message)

  const nameById = new Map(
    (people ?? []).map((row) => [
      String((row as Record<string, unknown>).id),
      typeof (row as Record<string, unknown>).name === 'string'
        ? String((row as Record<string, unknown>).name)
        : 'Unknown',
    ]),
  )

  return dedupePhotoFaceAnnotations(
    faces.map((face) => ({
      face_id: face.id,
      person_id: face.person_id,
      person_name: nameById.get(face.person_id) ?? 'Unknown',
      face_thumbnail_url: face.face_thumbnail_url,
      bounding_box: face.bounding_box,
    })),
  )
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
  await refreshBestPersonCover(params.personId)
  await refreshBestPersonCover(newPerson.id)

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

  // "No face here" = false detection on this photo → remove EVERY face tag on it,
  // not only the current person (otherwise other people remain on the same photo).
  const { data: faces, error: selectError } = await supabase
    .from('faces')
    .select('id, person_id, face_thumbnail_url')
    .in('photo_id', uniquePhotoIds)

  if (selectError) throw new Error(selectError.message)

  const faceRows = faces ?? []
  if (faceRows.length === 0) {
    throw new Error('No face detections found for the selected photos.')
  }

  const faceIds = faceRows.map((row) => String(row.id))
  const affectedPersonIds = [
    ...new Set([params.personId, ...faceRows.map((row) => String(row.person_id))]),
  ]

  const removedThumbUrlsByPerson = new Map<string, Set<string>>()
  for (const row of faceRows) {
    const personId = String(row.person_id)
    const thumb =
      typeof row.face_thumbnail_url === 'string' ? row.face_thumbnail_url.trim() : ''
    if (!thumb) continue
    const set = removedThumbUrlsByPerson.get(personId) ?? new Set<string>()
    set.add(thumb)
    removedThumbUrlsByPerson.set(personId, set)
  }

  const { discardFacesOnPhotos, rejectFacesForPersonPhotos } = await import('@/lib/face-rejections')

  // Keep person-level rejection for the current person + discard the whole photo.
  await rejectFacesForPersonPhotos({
    personId: params.personId,
    photoIds: uniquePhotoIds,
  })
  await discardFacesOnPhotos(uniquePhotoIds)

  const { error: deleteError } = await supabase.from('faces').delete().in('id', faceIds)
  if (deleteError) throw new Error(deleteError.message)

  for (const personId of affectedPersonIds) {
    await refreshPersonPhotoCount(personId)

    const removedThumbs = removedThumbUrlsByPerson.get(personId)
    const { data: personRow } = await supabase
      .from('people')
      .select('cover_face_url')
      .eq('id', personId)
      .maybeSingle()
    const currentCover =
      typeof personRow?.cover_face_url === 'string' ? personRow.cover_face_url.trim() : ''

    if (currentCover && removedThumbs?.has(currentCover)) {
      const clearPrimary = await supabase
        .from('people')
        .update({ cover_face_url: null, cover_locked: false })
        .eq('id', personId)
      if (clearPrimary.error && /cover_locked/i.test(clearPrimary.error.message)) {
        const clearLegacy = await supabase
          .from('people')
          .update({ cover_face_url: null })
          .eq('id', personId)
        if (clearLegacy.error) throw new Error(clearLegacy.error.message)
      } else if (clearPrimary.error) {
        throw new Error(clearPrimary.error.message)
      }
    }

    await refreshBestPersonCover(personId, { force: true })
  }

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

  await Promise.all(
    personIds.map(async (personId) => {
      await refreshPersonPhotoCount(personId)
      await refreshBestPersonCover(personId)
    }),
  )
}

export async function insertFace(params: {
  photoId: string
  personId: string
  embedding: number[]
  faceThumbnailUrl: string | null
  boundingBox: BoundingBox
  confidence?: number | null
}): Promise<Face> {
  const supabase = createSupabaseAdminClient()
  const confidence =
    typeof params.confidence === 'number' && Number.isFinite(params.confidence)
      ? params.confidence
      : null

  const insertPayload: Record<string, unknown> = {
    photo_id: params.photoId,
    person_id: params.personId,
    embedding: formatEmbeddingForPg(params.embedding),
    face_thumbnail_url: params.faceThumbnailUrl,
    bounding_box: params.boundingBox,
  }
  if (confidence != null) {
    insertPayload.detection_confidence = confidence
  }

  let insertedRow: Record<string, unknown> | null = null
  const primary = await supabase.from('faces').insert(insertPayload).select(FACE_SELECT).single()

  if (primary.error && confidence != null && /detection_confidence/i.test(primary.error.message)) {
    delete insertPayload.detection_confidence
    const retry = await supabase
      .from('faces')
      .insert(insertPayload)
      .select(FACE_SELECT_LEGACY)
      .single()
    if (retry.error) throw new Error(retry.error.message)
    insertedRow = retry.data as Record<string, unknown>
  } else if (primary.error) {
    throw new Error(primary.error.message)
  } else {
    insertedRow = primary.data as Record<string, unknown>
  }

  await refreshPersonPhotoCount(params.personId)
  await refreshBestPersonCover(params.personId)

  return mapFace(insertedRow)
}

export async function getFacesByPersonId(personId: string): Promise<Face[]> {
  const supabase = createSupabaseAdminClient()
  return selectFaces((select) =>
    supabase.from('faces').select(select).eq('person_id', personId).order('created_at', { ascending: true }),
  )
}
