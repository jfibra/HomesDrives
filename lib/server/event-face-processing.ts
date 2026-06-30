import { createSupabaseAdminClient } from '@/lib/server/albums'
import { listPortalFoldersForAdmin } from '@/lib/portals/storage'
import { processPhotoFaces } from '@/lib/server/face-pipeline'

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|bmp|gif|heic|heif|avif)$/i

export type EventFaceScanMode = 'pending' | 'all'

function isProcessableImageName(fileName: string, fileType: string | null) {
  const normalizedType = fileType?.toLowerCase() ?? ''
  if (normalizedType.startsWith('image/')) return true
  return IMAGE_EXTENSIONS.test(fileName)
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export async function listEventImagePhotoIds(eventId: string): Promise<string[]> {
  const folders = await listPortalFoldersForAdmin(eventId)
  const folderIds = folders.map((folder) => folder.id)
  if (folderIds.length === 0) return []

  const supabase = createSupabaseAdminClient()
  const photoIds: string[] = []

  for (const folderChunk of chunk(folderIds, 80)) {
    let offset = 0

    while (true) {
      const { data, error } = await supabase
        .from('albums_photos')
        .select('id, original_file_name, file_type')
        .in('folder_id', folderChunk)
        .order('created_at', { ascending: true })
        .range(offset, offset + 499)

      if (error) throw new Error(error.message)

      const batch = data ?? []
      for (const row of batch) {
        const fileName = String(row.original_file_name ?? '')
        const fileType = typeof row.file_type === 'string' ? row.file_type : null
        if (isProcessableImageName(fileName, fileType)) {
          photoIds.push(String(row.id))
        }
      }

      if (batch.length < 500) break
      offset += 500
    }
  }

  return photoIds
}

export async function listEventPhotosPendingFaceScan(eventId: string): Promise<string[]> {
  const folders = await listPortalFoldersForAdmin(eventId)
  const folderIds = folders.map((folder) => folder.id)
  if (folderIds.length === 0) return []

  const supabase = createSupabaseAdminClient()
  const pendingIds: string[] = []

  for (const folderChunk of chunk(folderIds, 80)) {
    let offset = 0

    while (true) {
      const { data, error } = await supabase
        .from('albums_photos')
        .select('id, original_file_name, file_type')
        .in('folder_id', folderChunk)
        .is('faces_scanned_at', null)
        .order('created_at', { ascending: true })
        .range(offset, offset + 499)

      if (error) {
        if (/faces_scanned_at/i.test(error.message)) {
          return listEventImagePhotoIds(eventId)
        }
        throw new Error(error.message)
      }

      const batch = data ?? []
      for (const row of batch) {
        const fileName = String(row.original_file_name ?? '')
        const fileType = typeof row.file_type === 'string' ? row.file_type : null
        if (isProcessableImageName(fileName, fileType)) {
          pendingIds.push(String(row.id))
        }
      }

      if (batch.length < 500) break
      offset += 500
    }
  }

  return pendingIds
}

export async function getEventFaceScanStatus(eventId: string) {
  const totalPhotos = (await listEventImagePhotoIds(eventId)).length
  const pendingPhotos = (await listEventPhotosPendingFaceScan(eventId)).length

  return {
    totalPhotos,
    pendingPhotos,
    scannedPhotos: Math.max(0, totalPhotos - pendingPhotos),
    upToDate: pendingPhotos === 0,
  }
}

export async function processEventPhotoFacesBatch(params: {
  eventId: string
  offset?: number
  limit?: number
  mode?: EventFaceScanMode
}) {
  const offset = Math.max(0, params.offset ?? 0)
  const limit = Math.min(10, Math.max(1, params.limit ?? 5))
  const mode = params.mode ?? 'pending'
  const photoIds =
    mode === 'all'
      ? await listEventImagePhotoIds(params.eventId)
      : await listEventPhotosPendingFaceScan(params.eventId)
  const batch = photoIds.slice(offset, offset + limit)

  let facesDetected = 0
  let failed = 0
  const errors: string[] = []

  for (const photoId of batch) {
    try {
      const result = await processPhotoFaces(photoId)
      facesDetected += result.facesDetected
    } catch (error) {
      failed += 1
      if (errors.length < 5) {
        errors.push(error instanceof Error ? error.message : 'Face processing failed.')
      }
    }
  }

  const nextOffset = offset + batch.length
  const done = nextOffset >= photoIds.length

  return {
    mode,
    totalPhotos: photoIds.length,
    processed: batch.length,
    facesDetected,
    failed,
    offset,
    nextOffset: done ? null : nextOffset,
    done,
    errors,
  }
}
