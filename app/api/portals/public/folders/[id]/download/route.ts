import { NextResponse } from 'next/server'
import JSZip from 'jszip'

import { requirePortalEventBySlug } from '@/lib/portals/events'
import {
  downloadPortalPhotoObject,
  getPublicPhotographerFolderTreeContext,
  listPortalPhotoFilesByFolderIds,
} from '@/lib/portals/storage'

export const runtime = 'nodejs'

function sanitizeSegment(input: string) {
  return (input || 'folder')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const { searchParams } = new URL(request.url)
    const eventSlug = searchParams.get('eventSlug')?.trim() ?? ''
    if (!id) return NextResponse.json({ error: 'Missing folder id.' }, { status: 400 })
    if (!eventSlug) {
      return NextResponse.json({ error: 'Missing eventSlug.' }, { status: 400 })
    }

    const event = await requirePortalEventBySlug(eventSlug)
    const folderContext = await getPublicPhotographerFolderTreeContext(id, event.id)
    if (!folderContext) return NextResponse.json({ error: 'Folder not found.' }, { status: 404 })

    const { root, byId, folderIds } = folderContext
    const photos = await listPortalPhotoFilesByFolderIds(folderIds)

    const folderPathCache = new Map<string, string>()
    const getRelativeFolderPath = (folderId: string) => {
      if (folderPathCache.has(folderId)) return folderPathCache.get(folderId)!
      const parts: string[] = []
      let cursor: string | null | undefined = folderId
      while (cursor && cursor !== id) {
        const folder = byId.get(cursor)
        if (!folder) break
        parts.unshift(sanitizeSegment(folder.folder_name))
        cursor = folder.parent_folder_id
      }
      const result = parts.join('/')
      folderPathCache.set(folderId, result)
      return result
    }

    const zip = new JSZip()
    const rootName = sanitizeSegment(root.folder_name)

    for (const photo of photos) {
      if (!photo.folder_id) continue
      const rel = photo.folder_id === id ? '' : getRelativeFolderPath(photo.folder_id)
      const folderPrefix = rel ? `${rootName}/${rel}` : rootName
      const fileName = sanitizeSegment(photo.original_file_name) || `${photo.id}.jpg`
      const buffer = await downloadPortalPhotoObject({
        bucketName: photo.bucket_name,
        storagePath: photo.storage_path,
      })
      zip.file(`${folderPrefix}/${fileName}`, buffer)
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
    const fileName = `${rootName}.zip`

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename=\"${fileName}\"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to download zip.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
