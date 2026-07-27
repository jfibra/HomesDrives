import { NextResponse } from 'next/server'

import { getPortalEventById } from '@/lib/portals/events'
import { requirePortalAdmin } from '@/lib/portals/storage'
import { processEventDeepMatchBatch } from '@/lib/server/event-deep-match'

export const runtime = 'nodejs'
export const maxDuration = 300

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const adminCode = typeof body?.adminCode === 'string' ? body.adminCode.trim() : ''
    const personOffset =
      typeof body?.personOffset === 'number' && Number.isFinite(body.personOffset)
        ? Math.max(0, Math.floor(body.personOffset))
        : 0
    const scanOffset =
      typeof body?.scanOffset === 'number' && Number.isFinite(body.scanOffset)
        ? Math.max(0, Math.floor(body.scanOffset))
        : 0
    const requeueEmpty = body?.requeueEmpty === true

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)
    const event = await getPortalEventById(id)
    if (!event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
    }

    const result = await processEventDeepMatchBatch({
      eventId: event.id,
      personOffset,
      scanOffset,
      requeueEmpty,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[deep-match]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to deep-match event faces.' },
      { status: 500 },
    )
  }
}
