import { createSupabaseAdminClient } from '@/lib/server/albums'

export async function rejectFacesForPersonPhotos(params: {
  personId: string
  photoIds: string[]
}): Promise<void> {
  const uniquePhotoIds = [...new Set(params.photoIds.map((id) => id.trim()).filter(Boolean))]
  if (uniquePhotoIds.length === 0) return

  const supabase = createSupabaseAdminClient()
  const rows = uniquePhotoIds.map((photoId) => ({
    photo_id: photoId,
    person_id: params.personId,
  }))

  const { error } = await supabase.from('face_rejections').upsert(rows, {
    onConflict: 'photo_id,person_id',
    ignoreDuplicates: true,
  })

  // Table may not exist until SQL migration is applied — don't block removal.
  if (error && !/face_rejections|does not exist|schema cache/i.test(error.message)) {
    throw new Error(error.message)
  }
}

/** Mark photos as having no usable faces — skip all future face detection. */
export async function discardFacesOnPhotos(photoIds: string[]): Promise<void> {
  const uniquePhotoIds = [...new Set(photoIds.map((id) => id.trim()).filter(Boolean))]
  if (uniquePhotoIds.length === 0) return

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('albums_photos')
    .update({
      faces_discarded_at: new Date().toISOString(),
      faces_scanned_at: new Date().toISOString(),
    })
    .in('id', uniquePhotoIds)

  if (error && !/faces_discarded_at|does not exist|schema cache/i.test(error.message)) {
    throw new Error(error.message)
  }
}

export async function isPhotoFacesDiscarded(photoId: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('albums_photos')
    .select('faces_discarded_at')
    .eq('id', photoId)
    .maybeSingle()

  if (error) {
    if (/faces_discarded_at|does not exist|schema cache/i.test(error.message)) {
      return false
    }
    throw new Error(error.message)
  }

  return Boolean(data?.faces_discarded_at)
}

export async function listRejectedPersonIdsForPhoto(photoId: string): Promise<Set<string>> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('face_rejections')
    .select('person_id')
    .eq('photo_id', photoId)

  if (error) {
    if (/face_rejections|does not exist|schema cache/i.test(error.message)) {
      return new Set()
    }
    throw new Error(error.message)
  }

  return new Set((data ?? []).map((row) => String(row.person_id)))
}

export async function isFaceRejectedForPerson(photoId: string, personId: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('face_rejections')
    .select('photo_id')
    .eq('photo_id', photoId)
    .eq('person_id', personId)
    .maybeSingle()

  if (error) {
    if (/face_rejections|does not exist|schema cache/i.test(error.message)) {
      return false
    }
    throw new Error(error.message)
  }

  return Boolean(data)
}
