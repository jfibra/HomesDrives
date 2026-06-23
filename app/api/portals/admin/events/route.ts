import { NextResponse } from 'next/server'

import { createPortalEvent, listPortalEvents } from '@/lib/portals/events'
import { requirePortalAdmin } from '@/lib/portals/storage'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const adminCode = searchParams.get('adminCode')?.trim() ?? ''
    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)
    const events = await listPortalEvents()
    return NextResponse.json({ events })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load events.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const adminCode = typeof body?.adminCode === 'string' ? body.adminCode.trim() : ''
    const name = typeof body?.name === 'string' ? body.name.trim() : ''

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }
    if (!name) {
      return NextResponse.json({ error: 'Event name is required.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)
    const event = await createPortalEvent(name)
    return NextResponse.json({ event }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create event.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
