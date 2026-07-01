import { NextResponse } from 'next/server'

import { registerEventPhotographer, requireEventPhotographerForEvent } from '@/lib/portals/event-photographers'
import {
  publicEventResponse,
  requirePhotographerAccessFromRequest,
} from '@/lib/portals/require-photographer-access'
import { readPhotographerIdFromRequest } from '@/lib/portals/photographer-identity'

export const runtime = 'nodejs'

function accessErrorStatus(message: string) {
  return /access denied|incorrect pin|6-digit|session expired|full name/i.test(message) ? 401 : 500
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const eventSlug = searchParams.get('eventSlug')?.trim() ?? ''
    if (!eventSlug) {
      return NextResponse.json({ error: 'Missing eventSlug.' }, { status: 400 })
    }

    const event = await requirePhotographerAccessFromRequest(request, eventSlug)
    const photographerId = readPhotographerIdFromRequest(request)

    if (!photographerId) {
      return NextResponse.json({ identity: null, event: publicEventResponse(event) })
    }

    try {
      const photographer = await requireEventPhotographerForEvent(photographerId, event.id)
      return NextResponse.json({
        identity: { id: photographer.id, fullName: photographer.full_name },
        event: publicEventResponse(event),
      })
    } catch {
      return NextResponse.json({ identity: null, event: publicEventResponse(event) })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to verify photographer identity.'
    return NextResponse.json({ error: message }, { status: accessErrorStatus(message) })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const eventSlug = typeof body?.eventSlug === 'string' ? body.eventSlug.trim() : ''
    const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : ''

    if (!eventSlug) {
      return NextResponse.json({ error: 'Missing eventSlug.' }, { status: 400 })
    }
    if (!fullName) {
      return NextResponse.json({ error: 'Enter your full name.' }, { status: 400 })
    }

    const event = await requirePhotographerAccessFromRequest(request, eventSlug, body)
    const photographer = await registerEventPhotographer({ eventId: event.id, fullName })

    return NextResponse.json({
      identity: { id: photographer.id, fullName: photographer.full_name },
      photographer,
      event: publicEventResponse(event),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to register photographer.'
    return NextResponse.json({ error: message }, { status: accessErrorStatus(message) })
  }
}
