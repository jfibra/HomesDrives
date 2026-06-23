import { NextResponse } from 'next/server'

import { requirePortalEventBySlug } from '@/lib/portals/events'
import { listPortalPhotosForFolderTree } from '@/lib/portals/storage'

export const runtime = 'nodejs'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const { searchParams } = new URL(request.url)
    const eventSlug = searchParams.get('eventSlug')?.trim() ?? ''
    if (!id) {
      return NextResponse.json({ error: 'Missing folder id.' }, { status: 400 })
    }
    if (!eventSlug) {
      return NextResponse.json({ error: 'Missing eventSlug.' }, { status: 400 })
    }

    const event = await requirePortalEventBySlug(eventSlug)
    const result = await listPortalPhotosForFolderTree(id, {
      publicOnly: true,
      eventId: event.id,
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load photos.'
    const status = /not found/i.test(message) ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
