import { NextResponse } from 'next/server'

import { buildFolderTree, listPortalFoldersForPublic } from '@/lib/portals/storage'
import { requirePortalEventBySlug } from '@/lib/portals/events'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const eventSlug = searchParams.get('eventSlug')?.trim() ?? ''
    if (!eventSlug) {
      return NextResponse.json({ error: 'Missing eventSlug.' }, { status: 400 })
    }

    const event = await requirePortalEventBySlug(eventSlug)
    const folders = await listPortalFoldersForPublic(event.id)
    return NextResponse.json({ event, folders, tree: buildFolderTree(folders) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load folders.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
