import { NextResponse } from 'next/server'

import { deletePortalEvent, updatePortalEvent } from '@/lib/portals/events'
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
    const name = typeof body?.name === 'string' ? body.name : undefined

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }
    if (!id) {
      return NextResponse.json({ error: 'Missing event id.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)
    const event = await updatePortalEvent(id, { name })
    return NextResponse.json({ event })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update event.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const body = await request.json().catch(() => null)
    const adminCode = typeof body?.adminCode === 'string' ? body.adminCode.trim() : ''

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }
    if (!id) {
      return NextResponse.json({ error: 'Missing event id.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)
    await deletePortalEvent(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete event.'
    const status = /forbidden|not active|not found|cannot be deleted/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
