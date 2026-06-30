import { NextResponse } from 'next/server'

import { PHOTOGRAPHER_PORTAL_CODE } from '@/lib/portals/constants'
import {
  publicEventResponse,
  requirePhotographerAccessFromRequest,
} from '@/lib/portals/require-photographer-access'
import {
  buildFolderTree,
  createPortalFolder,
  listPortalFoldersForUploader,
} from '@/lib/portals/storage'

export const runtime = 'nodejs'

function accessErrorStatus(message: string) {
  return /access denied|incorrect pin|6-digit/i.test(message) ? 401 : 500
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const eventSlug = searchParams.get('eventSlug')?.trim() ?? ''
    if (!eventSlug) {
      return NextResponse.json({ error: 'Missing eventSlug.' }, { status: 400 })
    }

    const event = await requirePhotographerAccessFromRequest(request, eventSlug)
    const folders = await listPortalFoldersForUploader(PHOTOGRAPHER_PORTAL_CODE, event.id)
    return NextResponse.json({ event: publicEventResponse(event), folders, tree: buildFolderTree(folders) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load folders.'
    return NextResponse.json({ error: message }, { status: accessErrorStatus(message) })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const folderName = typeof body?.folderName === 'string' ? body.folderName.trim() : ''
    const eventSlug = typeof body?.eventSlug === 'string' ? body.eventSlug.trim() : ''
    const parentFolderId =
      typeof body?.parentFolderId === 'string' && body.parentFolderId.trim()
        ? body.parentFolderId.trim()
        : null

    if (!eventSlug) {
      return NextResponse.json({ error: 'Missing eventSlug.' }, { status: 400 })
    }
    if (!folderName) {
      return NextResponse.json({ error: 'Folder name is required.' }, { status: 400 })
    }

    const event = await requirePhotographerAccessFromRequest(request, eventSlug, body)
    const folder = await createPortalFolder({
      uploaderCode: PHOTOGRAPHER_PORTAL_CODE,
      folderName,
      parentFolderId,
      eventId: event.id,
    })
    return NextResponse.json({ folder }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create folder.'
    return NextResponse.json({ error: message }, { status: accessErrorStatus(message) })
  }
}
