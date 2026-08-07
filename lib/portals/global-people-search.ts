import { createSupabaseAdminClient } from '@/lib/server/albums'
import {
  getAdminEventPersonPath,
  getAdminEventPhotosPath,
} from '@/lib/portals/constants'

export type GlobalSearchEventRef = {
  id: string
  name: string
  slug: string
}

export type GlobalSearchPersonHit = {
  kind: 'person'
  personId: string
  name: string
  coverFaceUrl: string | null
  photoCount: number
  events: GlobalSearchEventRef[]
  href: string
}

export type GlobalSearchPhotoHit = {
  kind: 'photo'
  photoId: string
  fileName: string
  imageUrl: string
  event: GlobalSearchEventRef
  href: string
}

export type GlobalPeopleSearchResult = {
  query: string
  people: GlobalSearchPersonHit[]
  photos: GlobalSearchPhotoHit[]
}

function escapeIlikePattern(value: string) {
  return value.replace(/[%_\\]/g, '\\$&')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (Array.isArray(value)) {
    const first = value[0]
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : null
  }
  return typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function mapEventRef(row: Record<string, unknown>): GlobalSearchEventRef | null {
  const id = typeof row.id === 'string' ? row.id : ''
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  const slug = typeof row.slug === 'string' ? row.slug.trim() : ''
  if (!id || !slug) return null
  return { id, name: name || slug, slug }
}

async function searchPeopleAcrossEvents(query: string, limit = 24): Promise<GlobalSearchPersonHit[]> {
  const supabase = createSupabaseAdminClient()
  const pattern = `%${escapeIlikePattern(query)}%`

  const { data: peopleRows, error: peopleError } = await supabase
    .from('people')
    .select('id, name, cover_face_url, photo_count')
    .ilike('name', pattern)
    .gt('photo_count', 0)
    .order('photo_count', { ascending: false })
    .limit(Math.min(40, Math.max(limit, 1)))

  if (peopleError) throw new Error(peopleError.message)

  const people = (peopleRows ?? []).map((row) => ({
    id: String(row.id),
    name: typeof row.name === 'string' ? row.name : 'Unknown',
    coverFaceUrl:
      typeof row.cover_face_url === 'string' && row.cover_face_url.trim()
        ? row.cover_face_url.trim()
        : null,
    photoCount: typeof row.photo_count === 'number' ? row.photo_count : 0,
  }))

  if (people.length === 0) return []

  const personIds = people.map((person) => person.id)
  const { data: faceRows, error: faceError } = await supabase
    .from('faces')
    .select(
      'person_id, photo_id, albums_photos!inner(id, albums_folders!inner(portal_event_id, portal_events!inner(id, name, slug, status)))',
    )
    .in('person_id', personIds)

  if (faceError) throw new Error(faceError.message)

  const eventsByPerson = new Map<string, Map<string, GlobalSearchEventRef>>()
  const photoCountByPersonEvent = new Map<string, Set<string>>()

  for (const row of faceRows ?? []) {
    const personId = String((row as Record<string, unknown>).person_id ?? '')
    const photoId = String((row as Record<string, unknown>).photo_id ?? '')
    const photo = asRecord((row as Record<string, unknown>).albums_photos)
    const folder = asRecord(photo?.albums_folders)
    const eventRow = asRecord(folder?.portal_events)
    if (!personId || !eventRow) continue
    if (String(eventRow.status ?? '') !== 'active') continue

    const event = mapEventRef(eventRow)
    if (!event) continue

    if (!eventsByPerson.has(personId)) eventsByPerson.set(personId, new Map())
    eventsByPerson.get(personId)!.set(event.id, event)

    const key = `${personId}:${event.id}`
    if (!photoCountByPersonEvent.has(key)) photoCountByPersonEvent.set(key, new Set())
    if (photoId) photoCountByPersonEvent.get(key)!.add(photoId)
  }

  const hits: GlobalSearchPersonHit[] = []

  for (const person of people) {
    const events = [...(eventsByPerson.get(person.id)?.values() ?? [])]
    if (events.length === 0) continue

    // One result card per event so the event label is clear when opening.
    for (const event of events) {
      const eventPhotoCount = photoCountByPersonEvent.get(`${person.id}:${event.id}`)?.size ?? 0
      hits.push({
        kind: 'person',
        personId: person.id,
        name: person.name,
        coverFaceUrl: person.coverFaceUrl,
        photoCount: eventPhotoCount || person.photoCount,
        events: [event],
        href: getAdminEventPersonPath(event.slug, person.id),
      })
    }
  }

  return hits.slice(0, limit)
}

async function searchPhotosAcrossEvents(query: string, limit = 36): Promise<GlobalSearchPhotoHit[]> {
  const supabase = createSupabaseAdminClient()
  const pattern = `%${escapeIlikePattern(query)}%`

  const { data, error } = await supabase
    .from('albums_photos')
    .select(
      'id, image_url, original_file_name, created_at, albums_folders!inner(portal_event_id, portal_events!inner(id, name, slug, status))',
    )
    .ilike('original_file_name', pattern)
    .not('albums_folders.portal_event_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(Math.min(80, Math.max(limit * 2, 1)))

  if (error) throw new Error(error.message)

  const hits: GlobalSearchPhotoHit[] = []

  for (const row of data ?? []) {
    const folder = asRecord((row as Record<string, unknown>).albums_folders)
    const eventRow = asRecord(folder?.portal_events)
    if (!eventRow || String(eventRow.status ?? '') !== 'active') continue

    const event = mapEventRef(eventRow)
    if (!event) continue

    const photoId = String(row.id)
    const fileName =
      typeof row.original_file_name === 'string' && row.original_file_name.trim()
        ? row.original_file_name.trim()
        : 'Untitled'
    const imageUrl = typeof row.image_url === 'string' ? row.image_url : ''

    hits.push({
      kind: 'photo',
      photoId,
      fileName,
      imageUrl,
      event,
      href: `${getAdminEventPhotosPath(event.slug)}?q=${encodeURIComponent(fileName)}`,
    })

    if (hits.length >= limit) break
  }

  return hits
}

export async function searchPeopleAndPhotosAcrossEvents(params: {
  query: string
  peopleLimit?: number
  photosLimit?: number
}): Promise<GlobalPeopleSearchResult> {
  const query = params.query.trim()
  if (query.length < 2) {
    return { query, people: [], photos: [] }
  }

  const [people, photos] = await Promise.all([
    searchPeopleAcrossEvents(query, params.peopleLimit ?? 24),
    searchPhotosAcrossEvents(query, params.photosLimit ?? 36),
  ])

  return { query, people, photos }
}
