import { NextResponse } from 'next/server'

import { getPortalEventById } from '@/lib/portals/events'
import {
  getEventFaceScanStatus,
  processEventPhotoFacesBatch,
  type EventFaceScanMode,
} from '@/lib/server/event-face-processing'
import { requirePortalAdmin } from '@/lib/portals/storage'

export const runtime = 'nodejs'
export const maxDuration = 300

type RouteContext = {
  params: Promise<{ id: string }>
}

function readAdminCode(request: Request, body?: Record<string, unknown> | null) {
  if (body && typeof body.adminCode === 'string') {
    return body.adminCode.trim()
  }

  const url = new URL(request.url)
  return url.searchParams.get('adminCode')?.trim() ?? ''
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const adminCode = readAdminCode(request)
    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)
    const event = await getPortalEventById(id)
    if (!event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
    }

    const status = await getEventFaceScanStatus(event.id)
    return NextResponse.json(status)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to read face scan status.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const body = await request.json().catch(() => null)
    const adminCode = readAdminCode(request, body)
    const offset = typeof body?.offset === 'number' && Number.isFinite(body.offset) ? body.offset : 0
    const limit = typeof body?.limit === 'number' && Number.isFinite(body.limit) ? body.limit : 5
    const mode: EventFaceScanMode = body?.mode === 'all' ? 'all' : 'pending'

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)
    const event = await getPortalEventById(id)
    if (!event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
    }

    const result = await processEventPhotoFacesBatch({
      eventId: event.id,
      offset,
      limit,
      mode,
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to process event photos.' },
      { status: 500 },
    )
  }
}
