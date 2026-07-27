import { createSupabaseAdminClient } from '@/lib/server/albums'
import { compareFacesForCover, refreshPersonCoverFromBestFace } from '@/lib/face-cover'
import { isFaceRejectedForPerson, isPhotoFacesDiscarded } from '@/lib/face-rejections'
import { refreshPersonPhotoCount } from '@/lib/people'
import { linkPersonInPhotoIfMatch } from '@/lib/server/face-pipeline'
import { listEventImagePhotoIds } from '@/lib/server/event-face-processing'
import {
  FACE_EMBEDDING_DIMENSIONS,
  FACE_FIND_MORE_THRESHOLD,
  FACE_LINK_THRESHOLD,
} from '@/lib/types/people'
import { findSimilarFacesForEvent } from '@/lib/vector-search'

const FIND_MORE_SCAN_BATCH = Number.parseInt(process.env.FACE_FIND_MORE_SCAN_BATCH ?? '25', 10)

function chunkIds<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function photoIdFromRpcRow(row: unknown): string {
  if (typeof row === 'object' && row && 'photo_id' in row) {
    return String((row as Record<string, unknown>).photo_id)
  }
  return ''
}

function parseEmbedding(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    const embedding = value.map((item) => Number(item)).filter((item) => Number.isFinite(item))
    return embedding.length === FACE_EMBEDDING_DIMENSIONS ? embedding : null
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed)) {
        const embedding = parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item))
        return embedding.length === FACE_EMBEDDING_DIMENSIONS ? embedding : null
      }
    } catch {
      return null
    }
  }
  return null
}

async function getBestPersonEmbeddingForEvent(params: {
  personId: string
  eventId: string
}): Promise<number[] | null> {
  const supabase = createSupabaseAdminClient()

  const { data: idRows, error: idError } = await supabase.rpc('get_person_photo_ids_for_event', {
    p_person_id: params.personId,
    p_event_id: params.eventId,
    p_limit: 200,
    p_offset: 0,
  })

  if (idError) throw new Error(idError.message)

  const photoIds = (idRows ?? []).map(photoIdFromRpcRow).filter(Boolean)

  if (photoIds.length === 0) return null

  const { data, error } = await supabase
    .from('faces')
    .select('embedding, detection_confidence, bounding_box')
    .eq('person_id', params.personId)
    .in('photo_id', photoIds)

  if (error) throw new Error(error.message)

  const candidates = (data ?? [])
    .map((row) => {
      const embedding = parseEmbedding((row as Record<string, unknown>).embedding)
      if (!embedding) return null
      const confidenceRaw = (row as Record<string, unknown>).detection_confidence
      const boundingBox = (row as Record<string, unknown>).bounding_box
      return {
        embedding,
        confidence: typeof confidenceRaw === 'number' ? confidenceRaw : null,
        bounding_box:
          boundingBox && typeof boundingBox === 'object'
            ? (boundingBox as { x: number; y: number; width: number; height: number })
            : { x: 0, y: 0, width: 0, height: 0 },
      }
    })
    .filter((row): row is NonNullable<typeof row> => row != null)

  if (candidates.length === 0) return null
  return [...candidates].sort(compareFacesForCover)[0]?.embedding ?? null
}

async function listPersonPhotoIdsForEvent(personId: string, eventId: string): Promise<Set<string>> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('get_person_photo_ids_for_event', {
    p_person_id: personId,
    p_event_id: eventId,
    p_limit: 10000,
    p_offset: 0,
  })

  if (error) throw new Error(error.message)

  return new Set((data ?? []).map(photoIdFromRpcRow).filter(Boolean))
}

async function listDiscardedPhotoIds(photoIds: string[]): Promise<Set<string>> {
  if (photoIds.length === 0) return new Set()

  const supabase = createSupabaseAdminClient()
  const discarded = new Set<string>()

  for (const chunk of chunkIds(photoIds, 200)) {
    const { data, error } = await supabase
      .from('albums_photos')
      .select('id')
      .in('id', chunk)
      .not('faces_discarded_at', 'is', null)

    if (error) {
      if (/faces_discarded_at|does not exist|schema cache/i.test(error.message)) {
        return discarded
      }
      throw new Error(error.message)
    }

    for (const row of data ?? []) {
      discarded.add(String(row.id))
    }
  }

  return discarded
}

async function listRejectedPhotoIdsForPerson(personId: string): Promise<Set<string>> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('face_rejections')
    .select('photo_id')
    .eq('person_id', personId)

  if (error) {
    if (/face_rejections|does not exist|schema cache/i.test(error.message)) {
      return new Set()
    }
    throw new Error(error.message)
  }

  return new Set((data ?? []).map((row) => String(row.photo_id)))
}

async function relinkExistingEventFaces(params: {
  personId: string
  eventId: string
  embedding: number[]
  threshold: number
}): Promise<{ linkedPhotos: number; linkedFaces: number }> {
  const matches = await findSimilarFacesForEvent({
    eventId: params.eventId,
    embedding: params.embedding,
    threshold: params.threshold,
    limit: 500,
  })

  const linkedPhotoIds = await listPersonPhotoIdsForEvent(params.personId, params.eventId)
  const supabase = createSupabaseAdminClient()
  let linkedFaces = 0
  const newlyLinkedPhotos = new Set<string>()
  const refreshedOtherPeople = new Set<string>()

  for (const match of matches) {
    if (linkedPhotoIds.has(match.photo_id)) {
      continue
    }
    if (await isPhotoFacesDiscarded(match.photo_id)) {
      continue
    }
    if (await isFaceRejectedForPerson(match.photo_id, params.personId)) {
      continue
    }

    const { data: existingForPerson, error: existingError } = await supabase
      .from('faces')
      .select('id')
      .eq('photo_id', match.photo_id)
      .eq('person_id', params.personId)
      .maybeSingle()

    if (existingError) throw new Error(existingError.message)
    if (existingForPerson) {
      linkedPhotoIds.add(match.photo_id)
      continue
    }

    const { error: updateError } = await supabase
      .from('faces')
      .update({ person_id: params.personId })
      .eq('id', match.face_id)

    if (updateError) throw new Error(updateError.message)

    linkedFaces += 1
    linkedPhotoIds.add(match.photo_id)
    newlyLinkedPhotos.add(match.photo_id)

    if (match.person_id !== params.personId) {
      refreshedOtherPeople.add(match.person_id)
    }
  }

  for (const otherPersonId of refreshedOtherPeople) {
    await refreshPersonPhotoCount(otherPersonId)
  }

  return { linkedPhotos: newlyLinkedPhotos.size, linkedFaces }
}

async function scanUnlinkedEventPhotosForPerson(params: {
  personId: string
  eventId: string
  embedding: number[]
  threshold: number
  scanLimit?: number
  scanOffset?: number
}): Promise<{
  linkedPhotos: number
  linkedFaces: number
  scannedPhotos: number
  remainingPhotos: number
  nextScanOffset: number
  candidatePhotos: number
  scanErrors: number
  warning?: string
}> {
  const linkedPhotoIds = await listPersonPhotoIdsForEvent(params.personId, params.eventId)
  const rejectedPhotoIds = await listRejectedPhotoIdsForPerson(params.personId)
  const eventPhotoIds = await listEventImagePhotoIds(params.eventId)
  const discardedPhotoIds = await listDiscardedPhotoIds(eventPhotoIds)

  const candidates: string[] = []
  for (const photoId of eventPhotoIds) {
    if (linkedPhotoIds.has(photoId)) continue
    if (rejectedPhotoIds.has(photoId)) continue
    if (discardedPhotoIds.has(photoId)) continue
    candidates.push(photoId)
  }

  const scanLimit = Math.min(50, Math.max(1, params.scanLimit ?? FIND_MORE_SCAN_BATCH))
  const offset = Math.max(0, params.scanOffset ?? 0)
  const batch = candidates.slice(offset, offset + scanLimit)
  let linkedFaces = 0
  const newlyLinkedPhotos = new Set<string>()
  let scanErrors = 0
  let scannedPhotos = 0
  let serviceUnavailable = false
  let serviceError = ''

  for (const photoId of batch) {
    if (serviceUnavailable) break

    try {
      const result = await linkPersonInPhotoIfMatch({
        photoId,
        personId: params.personId,
        referenceEmbedding: params.embedding,
        threshold: params.threshold,
      })
      scannedPhotos += 1
      if (result.linkedFaces > 0) {
        linkedFaces += result.linkedFaces
        newlyLinkedPhotos.add(photoId)
      }
    } catch (error) {
      scannedPhotos += 1
      scanErrors += 1
      const message = error instanceof Error ? error.message : 'Unable to scan photo.'
      console.warn(`[find-more] failed to scan photo ${photoId}:`, message)
      if (/cannot reach insightface|insightface api error|fetch failed|econnrefused/i.test(message)) {
        serviceUnavailable = true
        serviceError = message
      }
    }
  }

  const nextScanOffset = offset + scannedPhotos
  const remainingPhotos = Math.max(0, candidates.length - nextScanOffset)
  const warning = serviceUnavailable
    ? serviceError || 'Face detection service is unavailable. Start InsightFace and try again.'
    : scanErrors > 0
      ? `${scanErrors} image${scanErrors === 1 ? '' : 's'} could not be scanned in this batch.`
      : undefined

  return {
    linkedPhotos: newlyLinkedPhotos.size,
    linkedFaces,
    scannedPhotos,
    remainingPhotos,
    nextScanOffset: remainingPhotos > 0 ? nextScanOffset : 0,
    candidatePhotos: candidates.length,
    scanErrors,
    warning,
  }
}

export async function linkSimilarEventFacesToPerson(params: {
  personId: string
  eventId: string
  threshold?: number
  scanLimit?: number
  scanOffset?: number
}): Promise<{
  linkedPhotos: number
  linkedFaces: number
  relinkedPhotos: number
  relinkedFaces: number
  scannedPhotos: number
  remainingPhotos: number
  nextScanOffset: number
  candidatePhotos: number
  scanErrors: number
  warning?: string
}> {
  const embedding = await getBestPersonEmbeddingForEvent({
    personId: params.personId,
    eventId: params.eventId,
  })
  if (!embedding) {
    throw new Error('No face embedding found for this person in this event.')
  }

  const relinkThreshold = params.threshold ?? FACE_FIND_MORE_THRESHOLD
  const relinked = await relinkExistingEventFaces({
    personId: params.personId,
    eventId: params.eventId,
    embedding,
    threshold: Math.min(relinkThreshold, FACE_LINK_THRESHOLD),
  })

  const scanned = await scanUnlinkedEventPhotosForPerson({
    personId: params.personId,
    eventId: params.eventId,
    embedding,
    threshold: relinkThreshold,
    scanLimit: params.scanLimit,
    scanOffset: params.scanOffset,
  })

  const linkedPhotos = relinked.linkedPhotos + scanned.linkedPhotos
  const linkedFaces = relinked.linkedFaces + scanned.linkedFaces

  if (linkedFaces > 0) {
    await refreshPersonPhotoCount(params.personId)
    await refreshPersonCoverFromBestFace(params.personId)
  }

  return {
    linkedPhotos,
    linkedFaces,
    relinkedPhotos: relinked.linkedPhotos,
    relinkedFaces: relinked.linkedFaces,
    scannedPhotos: scanned.scannedPhotos,
    remainingPhotos: scanned.remainingPhotos,
    nextScanOffset: linkedPhotos > 0 ? 0 : scanned.nextScanOffset,
    candidatePhotos: scanned.candidatePhotos,
    scanErrors: scanned.scanErrors,
    warning: scanned.warning,
  }
}
