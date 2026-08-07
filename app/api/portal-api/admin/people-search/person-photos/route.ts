import { NextResponse } from 'next/server'

import { getPersonById, getPersonPhotosForEvent } from '@/lib/people'
import { requirePortalAdmin } from '@/lib/portals/storage'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const adminCode = url.searchParams.get('adminCode')?.trim() ?? ''
    const personId = url.searchParams.get('personId')?.trim() ?? ''
    const eventId = url.searchParams.get('eventId')?.trim() ?? ''
    const pageRaw = url.searchParams.get('page')
    const page =
      pageRaw && Number.isFinite(Number.parseInt(pageRaw, 10))
        ? Math.max(1, Number.parseInt(pageRaw, 10))
        : 1

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }
    if (!personId || !eventId) {
      return NextResponse.json({ error: 'Missing personId or eventId.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)

    const person = await getPersonById(personId)
    if (!person) {
      return NextResponse.json({ error: 'Person not found.' }, { status: 404 })
    }

    const photos = await getPersonPhotosForEvent({
      personId,
      eventId,
      page,
      pageSize: 60,
    })

    return NextResponse.json({
      person: {
        id: person.id,
        name: person.name,
        coverFaceUrl: person.cover_face_url,
        photoCount: person.photo_count,
      },
      photos: photos.items,
      page: photos.page,
      totalPages: photos.totalPages,
      totalCount: photos.totalCount,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load person photos.' },
      { status: 500 },
    )
  }
}
