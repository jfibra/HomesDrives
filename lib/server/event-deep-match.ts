import { createSupabaseAdminClient } from '@/lib/server/albums'
import { listPeopleForEvent } from '@/lib/people'
import { linkSimilarEventFacesToPerson } from '@/lib/person-face-linking'
import { listEventImagePhotoIds } from '@/lib/server/event-face-processing'

/**
 * Photos marked scanned but with zero face rows — often skipped by quality/
 * confidence gates. Clear the scan marker so they can be re-detected, without
 * wiping the people library.
 */
export async function requeueEmptyFaceScans(eventId: string): Promise<{
  requeued: number
}> {
  const photoIds = await listEventImagePhotoIds(eventId)
  if (photoIds.length === 0) return { requeued: 0 }

  const supabase = createSupabaseAdminClient()
  const emptyPhotoIds: string[] = []

  for (let index = 0; index < photoIds.length; index += 200) {
    const chunk = photoIds.slice(index, index + 200)
    const { data: faceRows, error: faceError } = await supabase
      .from('faces')
      .select('photo_id')
      .in('photo_id', chunk)

    if (faceError) throw new Error(faceError.message)

    const withFaces = new Set((faceRows ?? []).map((row) => String(row.photo_id)))
    for (const photoId of chunk) {
      if (!withFaces.has(photoId)) emptyPhotoIds.push(photoId)
    }
  }

  if (emptyPhotoIds.length === 0) return { requeued: 0 }

  let requeued = 0
  for (let index = 0; index < emptyPhotoIds.length; index += 200) {
    const chunk = emptyPhotoIds.slice(index, index + 200)
    const { error } = await supabase
      .from('albums_photos')
      .update({ faces_scanned_at: null })
      .in('id', chunk)
      .not('faces_scanned_at', 'is', null)

    if (error) {
      if (/faces_scanned_at|does not exist|schema cache/i.test(error.message)) {
        return { requeued }
      }
      throw new Error(error.message)
    }
    requeued += chunk.length
  }

  return { requeued }
}

export async function processEventDeepMatchBatch(params: {
  eventId: string
  personOffset?: number
  scanOffset?: number
  /** When true on the first batch, re-queue photos that scanned with zero faces. */
  requeueEmpty?: boolean
}): Promise<{
  done: boolean
  personOffset: number
  scanOffset: number
  nextPersonOffset: number
  nextScanOffset: number
  totalPeople: number
  personId: string | null
  personName: string | null
  linkedPhotos: number
  linkedFaces: number
  scannedPhotos: number
  remainingPhotos: number
  candidatePhotos: number
  requeuedEmpty: number
  warning?: string
}> {
  const personOffset = Math.max(0, params.personOffset ?? 0)
  const scanOffset = Math.max(0, params.scanOffset ?? 0)
  let requeuedEmpty = 0

  if (params.requeueEmpty && personOffset === 0 && scanOffset === 0) {
    requeuedEmpty = (await requeueEmptyFaceScans(params.eventId)).requeued
  }

  const firstPage = await listPeopleForEvent({
    eventId: params.eventId,
    page: 1,
    pageSize: 60,
  })
  const allPeople = [...firstPage.items]
  const totalPages = Math.max(1, firstPage.totalPages)
  for (let page = 2; page <= totalPages; page++) {
    const pageResult = await listPeopleForEvent({
      eventId: params.eventId,
      page,
      pageSize: 60,
    })
    allPeople.push(...pageResult.items)
  }

  const totalPeople = allPeople.length
  if (totalPeople === 0 || personOffset >= totalPeople) {
    return {
      done: true,
      personOffset,
      scanOffset,
      nextPersonOffset: totalPeople,
      nextScanOffset: 0,
      totalPeople,
      personId: null,
      personName: null,
      linkedPhotos: 0,
      linkedFaces: 0,
      scannedPhotos: 0,
      remainingPhotos: 0,
      candidatePhotos: 0,
      requeuedEmpty,
    }
  }

  const person = allPeople[personOffset]
  const result = await linkSimilarEventFacesToPerson({
    personId: person.id,
    eventId: params.eventId,
    scanOffset,
  })

  const personDone = result.remainingPhotos <= 0
  const nextPersonOffset = personDone ? personOffset + 1 : personOffset
  const nextScanOffset = personDone ? 0 : result.nextScanOffset
  const done = nextPersonOffset >= totalPeople

  return {
    done,
    personOffset,
    scanOffset,
    nextPersonOffset,
    nextScanOffset,
    totalPeople,
    personId: person.id,
    personName: person.name,
    linkedPhotos: result.linkedPhotos,
    linkedFaces: result.linkedFaces,
    scannedPhotos: result.scannedPhotos,
    remainingPhotos: result.remainingPhotos,
    candidatePhotos: result.candidatePhotos,
    requeuedEmpty,
    warning: result.warning,
  }
}
