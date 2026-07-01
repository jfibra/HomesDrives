import { NextResponse } from 'next/server'

import { buildBulkPortalRenamePlan } from '@/lib/portals/bulk-rename-photos'
import { bulkRenamePortalPhotos, requirePortalAdmin } from '@/lib/portals/storage'
import { getPersonPhotosByIdsForEvent, listAllPersonPhotosForEvent } from '@/lib/people'

export const runtime = 'nodejs'

type BulkRenamePersonPhotosBody = {
  adminCode?: string
  baseName?: string
  eventId?: string
  photoIds?: string[]
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: personId } = await context.params
    const body = (await request.json().catch(() => null)) as BulkRenamePersonPhotosBody | null
    const adminCode = typeof body?.adminCode === 'string' ? body.adminCode.trim() : ''
    const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : ''
    const baseName = typeof body?.baseName === 'string' ? body.baseName.trim() : ''
    const photoIds = Array.isArray(body?.photoIds)
      ? body.photoIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : []

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }
    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId.' }, { status: 400 })
    }
    if (!baseName) {
      return NextResponse.json({ error: 'Enter a base name for the files.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)

    const photos =
      photoIds.length > 0
        ? await getPersonPhotosByIdsForEvent({ personId, eventId, photoIds })
        : await listAllPersonPhotosForEvent({ personId, eventId })

    if (photos.length === 0) {
      return NextResponse.json({ error: 'No photos found to rename.' }, { status: 400 })
    }

    const renames = buildBulkPortalRenamePlan(baseName, photos)
    if (renames.length === 0) {
      return NextResponse.json({ error: 'Enter a valid base name for the files.' }, { status: 400 })
    }

    const renamedPhotos = await bulkRenamePortalPhotos(renames)
    return NextResponse.json({ photos: renamedPhotos, renamedCount: renamedPhotos.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to rename photos.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
