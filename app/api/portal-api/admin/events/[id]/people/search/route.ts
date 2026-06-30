import { NextResponse } from 'next/server'

import { getPortalEventById } from '@/lib/portals/events'
import { requirePortalAdmin } from '@/lib/portals/storage'
import { searchPeopleByFaceImage } from '@/lib/server/face-search'

export const runtime = 'nodejs'
export const maxDuration = 120

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const formData = await request.formData()
    const adminCode =
      typeof formData.get('adminCode') === 'string' ? String(formData.get('adminCode')).trim() : ''
    const file = formData.get('file')
    const limitRaw = formData.get('limit')
    const limit =
      typeof limitRaw === 'string' && Number.isFinite(Number.parseInt(limitRaw, 10))
        ? Number.parseInt(limitRaw, 10)
        : 12

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)
    const event = await getPortalEventById(id)
    if (!event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Upload a face image.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await searchPeopleByFaceImage({
      imageBuffer: buffer,
      eventId: event.id,
      limit,
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Face search failed.' },
      { status: 500 },
    )
  }
}
