import { NextResponse } from 'next/server'

import { reorderPortalFolders, requirePortalAdmin } from '@/lib/portals/storage'
import { requirePortalEventBySlug } from '@/lib/portals/events'

export const runtime = 'nodejs'

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const adminCode = typeof body?.adminCode === 'string' ? body.adminCode.trim() : ''
    const parentFolderId =
      typeof body?.parentFolderId === 'string' ? body.parentFolderId.trim() : null
    const folderIds = Array.isArray(body?.folderIds)
      ? body.folderIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
      : []

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }
    if (folderIds.length === 0) {
      return NextResponse.json({ error: 'Missing folderIds.' }, { status: 400 })
    }

    const eventSlug = typeof body?.eventSlug === 'string' ? body.eventSlug.trim() : ''
    if (!eventSlug) {
      return NextResponse.json({ error: 'Missing eventSlug.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)
    const event = await requirePortalEventBySlug(eventSlug)
    await reorderPortalFolders({ parentFolderId, folderIds, eventId: event.id })
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to reorder folders.'
    const status = /forbidden|not active|not found|invalid/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
