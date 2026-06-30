import { NextResponse } from 'next/server'

import {
  createPhotographerAccessToken,
  isValidPhotographerPin,
  readPhotographerAccessToken,
  requirePhotographerAccess,
  verifyPhotographerPin,
} from '@/lib/portals/photographer-access'
import { requirePortalEventBySlug, toPublicPortalEvent } from '@/lib/portals/events'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const eventSlug = searchParams.get('eventSlug')?.trim() ?? ''
    if (!eventSlug) {
      return NextResponse.json({ error: 'Missing eventSlug.' }, { status: 400 })
    }

    const event = await requirePortalEventBySlug(eventSlug)
    const accessToken = readPhotographerAccessToken(request)
    const requiresPin = Boolean(event.photographer_pin_hash)

    let authorized = !requiresPin
    if (requiresPin) {
      try {
        await requirePhotographerAccess({
          eventId: event.id,
          pinHash: event.photographer_pin_hash,
          accessToken,
        })
        authorized = true
      } catch {
        authorized = false
      }
    }

    return NextResponse.json({
      authorized,
      requiresPin,
      event: toPublicPortalEvent(event),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to check photographer access.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const eventSlug = typeof body?.eventSlug === 'string' ? body.eventSlug.trim() : ''
    const pin = typeof body?.pin === 'string' ? body.pin.trim() : ''

    if (!eventSlug) {
      return NextResponse.json({ error: 'Missing eventSlug.' }, { status: 400 })
    }
    if (!isValidPhotographerPin(pin)) {
      return NextResponse.json({ error: 'Enter the 6-digit event PIN.' }, { status: 400 })
    }

    const event = await requirePortalEventBySlug(eventSlug)
    if (!event.photographer_pin_hash) {
      return NextResponse.json({ accessToken: null, event: toPublicPortalEvent(event) })
    }

    if (!verifyPhotographerPin(pin, event.photographer_pin_hash)) {
      return NextResponse.json({ error: 'Incorrect PIN.' }, { status: 401 })
    }

    return NextResponse.json({
      accessToken: createPhotographerAccessToken(event.id),
      event: toPublicPortalEvent(event),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to verify photographer PIN.' },
      { status: 500 },
    )
  }
}
