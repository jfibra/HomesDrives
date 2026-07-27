import { createSupabaseAdminClient } from '@/lib/server/albums'
import type { PaginatedResult } from '@/lib/types/people'
import type { PortalPhoto } from '@/lib/portals/types'

export type EventPhotoListItem = PortalPhoto & {
  folder_name: string | null
}

function mapEventPhoto(row: Record<string, unknown>): EventPhotoListItem {
  const folder = row.albums_folders as Record<string, unknown> | null | undefined

  return {
    id: String(row.id),
    folder_id: typeof row.folder_id === 'string' ? row.folder_id : null,
    image_url: typeof row.image_url === 'string' ? row.image_url : '',
    original_file_name:
      typeof row.original_file_name === 'string' ? row.original_file_name : 'Untitled',
    file_size_bytes: typeof row.file_size_bytes === 'number' ? row.file_size_bytes : 0,
    created_at: String(row.created_at ?? ''),
    uploader_name: typeof row.uploader_name === 'string' ? row.uploader_name : null,
    portal_photographer_id:
      typeof row.portal_photographer_id === 'string' ? row.portal_photographer_id : null,
    folder_name:
      typeof folder?.folder_name === 'string' && folder.folder_name.trim()
        ? folder.folder_name.trim()
        : null,
  }
}

function escapeIlikePattern(value: string) {
  return value.replace(/[%_\\]/g, '\\$&')
}

export async function countEventPhotos(params: {
  eventId: string
  search?: string
}): Promise<number> {
  const supabase = createSupabaseAdminClient()
  const search = params.search?.trim()

  let query = supabase
    .from('albums_photos')
    .select('id, albums_folders!inner(portal_event_id)', { count: 'exact', head: true })
    .eq('albums_folders.portal_event_id', params.eventId)

  if (search) {
    query = query.ilike('original_file_name', `%${escapeIlikePattern(search)}%`)
  }

  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function listEventPhotos(params: {
  eventId: string
  page?: number
  pageSize?: number
  search?: string
}): Promise<PaginatedResult<EventPhotoListItem>> {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(48, Math.max(1, params.pageSize ?? 24))
  const search = params.search?.trim()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const supabase = createSupabaseAdminClient()

  let query = supabase
    .from('albums_photos')
    .select(
      'id, folder_id, image_url, original_file_name, file_size_bytes, created_at, uploader_name, portal_photographer_id, albums_folders!inner(folder_name, portal_event_id)',
      { count: 'exact' },
    )
    .eq('albums_folders.portal_event_id', params.eventId)
    .order('created_at', { ascending: false })

  if (search) {
    query = query.ilike('original_file_name', `%${escapeIlikePattern(search)}%`)
  }

  const { data, error, count } = await query.range(from, to)
  if (error) throw new Error(error.message)

  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  return {
    items: (data ?? []).map((row) => mapEventPhoto(row as Record<string, unknown>)),
    page,
    pageSize,
    totalCount,
    totalPages,
  }
}
