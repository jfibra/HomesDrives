import { NextResponse } from 'next/server'

import { buildFolderTree, listPortalFoldersForAdmin, requirePortalAdmin } from '@/lib/portals/storage'
import { requirePortalEventBySlug } from '@/lib/portals/events'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const adminCode = searchParams.get('adminCode')?.trim() ?? ''
    const eventSlug = searchParams.get('eventSlug')?.trim() ?? ''
    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }
    if (!eventSlug) {
      return NextResponse.json({ error: 'Missing eventSlug.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)
    const event = await requirePortalEventBySlug(eventSlug)
    const folders = await listPortalFoldersForAdmin(event.id)
    return NextResponse.json({ event, folders, tree: buildFolderTree(folders) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load folders.'
    const status = /forbidden|not active|not found|missing/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
