import { NextResponse } from 'next/server'

import { requirePortalEventBySlug } from '@/lib/portals/events'
import { PHOTOGRAPHER_PORTAL_CODE } from '@/lib/portals/constants'
import {
  buildFolderTree,
  createPortalFolder,
  listPortalFoldersForUploader,
} from '@/lib/portals/storage'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const eventSlug = searchParams.get('eventSlug')?.trim() ?? ''
    if (!eventSlug) {
      return NextResponse.json({ error: 'Missing eventSlug.' }, { status: 400 })
    }

    const event = await requirePortalEventBySlug(eventSlug)
    const folders = await listPortalFoldersForUploader(PHOTOGRAPHER_PORTAL_CODE, event.id)
    return NextResponse.json({ event, folders, tree: buildFolderTree(folders) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load folders.' },
      { status: 500 },
    )
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

    const event = await requirePortalEventBySlug(eventSlug)
    const folder = await createPortalFolder({
      uploaderCode: PHOTOGRAPHER_PORTAL_CODE,
      folderName,
      parentFolderId,
      eventId: event.id,
    })
    return NextResponse.json({ folder }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create folder.' },
      { status: 500 },
    )
  }
}
