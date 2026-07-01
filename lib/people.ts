import { createSupabaseAdminClient } from '@/lib/server/albums'
import { derivePersonNameFromFileName } from '@/lib/person-name-from-file'
import type { PaginatedResult, Person, PersonPhoto } from '@/lib/types/people'

const PERSON_SELECT = 'id, name, cover_face_url, photo_count, created_at'

function mapPerson(row: Record<string, unknown>): Person {
  return {
    id: String(row.id),
    name: typeof row.name === 'string' ? row.name : 'Unknown',
    cover_face_url:
      typeof row.cover_face_url === 'string' && row.cover_face_url.trim()
        ? row.cover_face_url.trim()
        : null,
    photo_count: typeof row.photo_count === 'number' ? row.photo_count : 0,
    created_at: String(row.created_at ?? ''),
  }
}

function mapPersonPhoto(row: Record<string, unknown>): PersonPhoto {
  return {
    id: String(row.id),
    image_url: String(row.image_url ?? ''),
    original_file_name: String(row.original_file_name ?? 'photo'),
    width: typeof row.width === 'number' ? row.width : null,
    height: typeof row.height === 'number' ? row.height : null,
    created_at: String(row.created_at ?? ''),
  }
}

export async function listPeople(params: {
  page?: number
  pageSize?: number
}): Promise<PaginatedResult<Person>> {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(60, Math.max(1, params.pageSize ?? 24))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const supabase = createSupabaseAdminClient()
  const { data, error, count } = await supabase
    .from('people')
    .select(PERSON_SELECT, { count: 'exact' })
    .gt('photo_count', 0)
    .order('photo_count', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw new Error(error.message)

  const totalCount = count ?? 0
  return {
    items: (data ?? []).map((row) => mapPerson(row as Record<string, unknown>)),
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  }
}

export async function getPersonById(personId: string): Promise<Person | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('people')
    .select(PERSON_SELECT)
    .eq('id', personId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  return mapPerson(data as Record<string, unknown>)
}

export async function createPerson(params?: {
  name?: string
  coverFaceUrl?: string | null
}): Promise<Person> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('people')
    .insert({
      name: params?.name?.trim() || 'Unknown',
      cover_face_url: params?.coverFaceUrl ?? null,
      photo_count: 0,
    })
    .select(PERSON_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return mapPerson(data as Record<string, unknown>)
}

export async function updatePersonName(personId: string, name: string): Promise<Person> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Name is required.')

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('people')
    .update({ name: trimmed })
    .eq('id', personId)
    .select(PERSON_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return mapPerson(data as Record<string, unknown>)
}

export async function updatePersonCover(personId: string, coverFaceUrl: string): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('people')
    .update({ cover_face_url: coverFaceUrl })
    .eq('id', personId)

  if (error) throw new Error(error.message)
}

export async function refreshPersonPhotoCount(personId: string): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.rpc('refresh_person_photo_count', { p_person_id: personId })
  if (error) throw new Error(error.message)
}

export async function getPersonPhotos(params: {
  personId: string
  page?: number
  pageSize?: number
}): Promise<PaginatedResult<PersonPhoto>> {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(60, Math.max(1, params.pageSize ?? 24))
  const offset = (page - 1) * pageSize

  const supabase = createSupabaseAdminClient()

  const { data: countData, error: countError } = await supabase.rpc('count_person_photos', {
    p_person_id: params.personId,
  })
  if (countError) throw new Error(countError.message)

  const totalCount = Number(countData ?? 0)

  const { data: idRows, error: idError } = await supabase.rpc('get_person_photo_ids', {
    p_person_id: params.personId,
    p_limit: pageSize,
    p_offset: offset,
  })
  if (idError) throw new Error(idError.message)

  const photoIds = (idRows ?? [])
    .map((row) => (typeof row === 'object' && row && 'photo_id' in row ? String(row.photo_id) : ''))
    .filter(Boolean)

  if (photoIds.length === 0) {
    return { items: [], page, pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) }
  }

  const { data: photos, error: photosError } = await supabase
    .from('albums_photos')
    .select('id, image_url, original_file_name, width, height, created_at')
    .in('id', photoIds)

  if (photosError) throw new Error(photosError.message)

  const photoById = new Map(
    (photos ?? []).map((row) => [String(row.id), mapPersonPhoto(row as Record<string, unknown>)]),
  )
  const items = photoIds
    .map((id) => photoById.get(id))
    .filter((photo): photo is PersonPhoto => Boolean(photo))

  return {
    items,
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  }
}

export async function listPeopleForEvent(params: {
  eventId: string
  page?: number
  pageSize?: number
  search?: string
}): Promise<PaginatedResult<Person>> {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(60, Math.max(1, params.pageSize ?? 24))
  const offset = (page - 1) * pageSize
  const search = params.search?.trim() || null

  const supabase = createSupabaseAdminClient()

  const { data: countData, error: countError } = await supabase.rpc('count_people_for_event', {
    p_event_id: params.eventId,
    p_search: search,
  })
  if (countError) throw new Error(countError.message)

  const totalCount = Number(countData ?? 0)

  const { data, error } = await supabase.rpc('list_people_for_event', {
    p_event_id: params.eventId,
    p_limit: pageSize,
    p_offset: offset,
    p_search: search,
  })
  if (error) throw new Error(error.message)

  return {
    items: (data ?? []).map((row) => mapPerson(row as Record<string, unknown>)),
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  }
}

export async function getPersonPhotosForEvent(params: {
  personId: string
  eventId: string
  page?: number
  pageSize?: number
}): Promise<PaginatedResult<PersonPhoto>> {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(60, Math.max(1, params.pageSize ?? 24))
  const offset = (page - 1) * pageSize

  const supabase = createSupabaseAdminClient()

  const { data: countData, error: countError } = await supabase.rpc('count_person_photos_for_event', {
    p_person_id: params.personId,
    p_event_id: params.eventId,
  })
  if (countError) throw new Error(countError.message)

  const totalCount = Number(countData ?? 0)

  const { data: idRows, error: idError } = await supabase.rpc('get_person_photo_ids_for_event', {
    p_person_id: params.personId,
    p_event_id: params.eventId,
    p_limit: pageSize,
    p_offset: offset,
  })
  if (idError) throw new Error(idError.message)

  const photoIds = (idRows ?? [])
    .map((row) => (typeof row === 'object' && row && 'photo_id' in row ? String(row.photo_id) : ''))
    .filter(Boolean)

  if (photoIds.length === 0) {
    return { items: [], page, pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) }
  }

  const { data: photos, error: photosError } = await supabase
    .from('albums_photos')
    .select('id, image_url, original_file_name, width, height, created_at')
    .in('id', photoIds)

  if (photosError) throw new Error(photosError.message)

  const photoById = new Map(
    (photos ?? []).map((row) => [String(row.id), mapPersonPhoto(row as Record<string, unknown>)]),
  )
  const items = photoIds
    .map((id) => photoById.get(id))
    .filter((photo): photo is PersonPhoto => Boolean(photo))

  return {
    items,
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  }
}

export async function listAllPersonPhotosForEvent(params: {
  personId: string
  eventId: string
}): Promise<PersonPhoto[]> {
  const pageSize = 200
  let page = 1
  const items: PersonPhoto[] = []

  while (true) {
    const result = await getPersonPhotosForEvent({
      personId: params.personId,
      eventId: params.eventId,
      page,
      pageSize,
    })
    items.push(...result.items)
    if (page >= result.totalPages) {
      break
    }
    page += 1
  }

  return items
}

export async function getPersonPhotosByIdsForEvent(params: {
  personId: string
  eventId: string
  photoIds: string[]
}): Promise<PersonPhoto[]> {
  const uniqueIds = [...new Set(params.photoIds.map((id) => id.trim()).filter(Boolean))]
  if (uniqueIds.length === 0) {
    return []
  }

  const allPhotos = await listAllPersonPhotosForEvent({
    personId: params.personId,
    eventId: params.eventId,
  })
  const allowedIds = new Set(allPhotos.map((photo) => photo.id))
  return allPhotos.filter((photo) => uniqueIds.includes(photo.id) && allowedIds.has(photo.id))
}

export async function ensurePersonNameFromPhotoIfUnknown(
  personId: string,
  originalFileName: string,
): Promise<void> {
  const person = await getPersonById(personId)
  if (!person || person.name !== 'Unknown') return

  const derivedName = derivePersonNameFromFileName(originalFileName)
  if (!derivedName) return

  await updatePersonName(personId, derivedName)
}

export async function backfillUnknownPersonNamesForEvent(eventId: string): Promise<number> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('list_people_for_event', {
    p_event_id: eventId,
    p_limit: 5000,
    p_offset: 0,
  })
  if (error) throw new Error(error.message)

  let updated = 0

  for (const row of data ?? []) {
    const person = mapPerson(row as Record<string, unknown>)
    if (person.name !== 'Unknown') continue

    const photos = await getPersonPhotosForEvent({
      personId: person.id,
      eventId,
      page: 1,
      pageSize: 1,
    })
    const fileName = photos.items[0]?.original_file_name
    if (!fileName) continue

    const derivedName = derivePersonNameFromFileName(fileName)
    if (!derivedName) continue

    await updatePersonName(person.id, derivedName)
    updated += 1
  }

  return updated
}

export async function deletePeople(personIds: string[]): Promise<{ deleted: number }> {
  const uniqueIds = [...new Set(personIds.map((id) => id.trim()).filter(Boolean))]
  if (uniqueIds.length === 0) {
    throw new Error('Select at least one person.')
  }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('people').delete().in('id', uniqueIds)
  if (error) throw new Error(error.message)

  return { deleted: uniqueIds.length }
}
