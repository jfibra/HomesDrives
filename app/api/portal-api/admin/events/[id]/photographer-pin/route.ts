import { NextResponse } from 'next/server'

import {
  clearPhotographerPin,
  getPortalEventById,
  setPhotographerPin,
  toPublicPortalEvent,
} from '@/lib/portals/events'
import { requirePortalAdmin } from '@/lib/portals/storage'

export const runtime = 'nodejs'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const body = await request.json().catch(() => null)
    const adminCode = typeof body?.adminCode === 'string' ? body.adminCode.trim() : ''
    const pin = typeof body?.pin === 'string' ? body.pin.trim() : ''
    const clear = body?.clear === true

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)
    const existing = await getPortalEventById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
    }

    const event = clear ? await clearPhotographerPin(id) : await setPhotographerPin(id, pin)
    return NextResponse.json({ event: toPublicPortalEvent(event) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update photographer PIN.'
    const status = /6 digits|not found/i.test(message) ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
