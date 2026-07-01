import { PHOTOGRAPHER_PORTAL_CODE } from '@/lib/portals/constants'
import { buildFolderTree, listPortalFoldersForUploader } from '@/lib/portals/storage'
import { createSupabaseAdminClient } from '@/lib/server/albums'
import type { PortalFolder, PortalPhoto } from '@/lib/portals/types'
import { sortPortalPhotosByFileName } from '@/lib/portals/sort-photos'

export type EventPhotographer = {
  id: string
  portal_event_id: string
  full_name: string
  photo_count: number
  created_at: string
  last_seen_at: string
}

function normalizePhotographerName(fullName: string) {
  return fullName.trim().replace(/\s+/g, ' ')
}

function mapEventPhotographer(row: Record<string, unknown>, photoCount = 0): EventPhotographer {
  return {
    id: String(row.id),
    portal_event_id: String(row.portal_event_id),
    full_name: typeof row.full_name === 'string' ? row.full_name : 'Unknown',
    photo_count: photoCount,
    created_at: String(row.created_at ?? ''),
    last_seen_at: String(row.last_seen_at ?? ''),
  }
}

export async function getEventPhotographerById(photographerId: string) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('portal_event_photographers')
    .select('id, portal_event_id, full_name, created_at, last_seen_at')
    .eq('id', photographerId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  const photoCount = await countPhotosForEventPhotographer(photographerId, String(data.portal_event_id))
  return mapEventPhotographer(data as Record<string, unknown>, photoCount)
}

export async function requireEventPhotographerForEvent(photographerId: string, eventId: string) {
  const photographer = await getEventPhotographerById(photographerId)
  if (!photographer || photographer.portal_event_id !== eventId) {
    throw new Error('Photographer session expired. Enter your full name again.')
  }
  return photographer
}

async function countPhotosForEventPhotographer(photographerId: string, eventId: string) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('albums_photos')
    .select('id, albums_folders!inner(portal_event_id)')
    .eq('portal_photographer_id', photographerId)
    .eq('albums_folders.portal_event_id', eventId)

  if (error) throw new Error(error.message)
  return (data ?? []).length
}

export async function registerEventPhotographer(params: { eventId: string; fullName: string }) {
  const full_name = normalizePhotographerName(params.fullName)
  if (full_name.length < 2) {
    throw new Error('Enter your full name (at least 2 characters).')
  }

  const supabase = createSupabaseAdminClient()
  const { data: existingRows, error: existingError } = await supabase
    .from('portal_event_photographers')
    .select('id, portal_event_id, full_name, created_at, last_seen_at')
    .eq('portal_event_id', params.eventId)

  if (existingError) throw new Error(existingError.message)

  const normalizedLower = full_name.toLowerCase()
  const existing = (existingRows ?? []).find((row) => {
    const name = typeof row.full_name === 'string' ? row.full_name.trim().toLowerCase() : ''
    return name === normalizedLower
  })

  let photographerRow = existing

  if (photographerRow) {
    const { data, error } = await supabase
      .from('portal_event_photographers')
      .update({ last_seen_at: new Date().toISOString(), full_name })
      .eq('id', photographerRow.id)
      .select('id, portal_event_id, full_name, created_at, last_seen_at')
      .single()

    if (error) throw new Error(error.message)
    photographerRow = data
  } else {
    const { data, error } = await supabase
      .from('portal_event_photographers')
      .insert({
        portal_event_id: params.eventId,
        full_name,
      })
      .select('id, portal_event_id, full_name, created_at, last_seen_at')
      .single()

    if (error) throw new Error(error.message)
    photographerRow = data
  }

  if (!photographerRow) {
    throw new Error('Unable to register photographer.')
  }

  const photoCount = await countPhotosForEventPhotographer(String(photographerRow.id), params.eventId)
  return mapEventPhotographer(photographerRow as Record<string, unknown>, photoCount)
}

export async function listEventPhotographers(eventId: string): Promise<EventPhotographer[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('portal_event_photographers')
    .select('id, portal_event_id, full_name, created_at, last_seen_at')
    .eq('portal_event_id', eventId)
    .order('full_name', { ascending: true })

  if (error) throw new Error(error.message)

  const photographers = await Promise.all(
    (data ?? []).map(async (row) => {
      const photoCount = await countPhotosForEventPhotographer(String(row.id), eventId)
      return mapEventPhotographer(row as Record<string, unknown>, photoCount)
    }),
  )

  return photographers.sort((a, b) => {
    if (b.photo_count !== a.photo_count) return b.photo_count - a.photo_count
    return a.full_name.localeCompare(b.full_name)
  })
}

export async function listFoldersForEventPhotographer(params: {
  eventId: string
  photographerId: string
}): Promise<PortalFolder[]> {
  return listPortalFoldersForUploader(PHOTOGRAPHER_PORTAL_CODE, params.eventId, {
    portalPhotographerId: params.photographerId,
  })
}

export async function getEventPhotographerWorkspace(params: {
  eventId: string
  photographerId: string
}) {
  const folders = await listFoldersForEventPhotographer(params)
  const photos = await listPhotosForEventPhotographer(params)
  const photosByFolderId: Record<string, PortalPhoto[]> = {}

  for (const photo of photos) {
    if (!photo.folder_id) continue
    if (!photosByFolderId[photo.folder_id]) {
      photosByFolderId[photo.folder_id] = []
    }
    photosByFolderId[photo.folder_id].push(photo)
  }

  for (const folderId of Object.keys(photosByFolderId)) {
    photosByFolderId[folderId] = sortPortalPhotosByFileName(photosByFolderId[folderId])
  }

  return {
    folders,
    tree: buildFolderTree(folders),
    photosByFolderId,
    photoCount: photos.length,
  }
}

export async function listPhotosForEventPhotographer(params: {
  eventId: string
  photographerId: string
}): Promise<PortalPhoto[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('albums_photos')
    .select('id, folder_id, image_url, original_file_name, file_size_bytes, created_at, albums_folders!inner(portal_event_id)')
    .eq('portal_photographer_id', params.photographerId)
    .eq('albums_folders.portal_event_id', params.eventId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  return sortPortalPhotosByFileName((data ?? []) as PortalPhoto[])
}
