import { NextResponse } from 'next/server'

import { linkSimilarEventFacesToPerson } from '@/lib/person-face-linking'
import { getPersonById } from '@/lib/people'

export const runtime = 'nodejs'
export const maxDuration = 300

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: personId } = await context.params
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : ''
    const scanOffset =
      typeof body?.scanOffset === 'number' && Number.isFinite(body.scanOffset)
        ? Math.max(0, Math.floor(body.scanOffset))
        : 0

    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId.' }, { status: 400 })
    }

    const person = await getPersonById(personId)
    if (!person) {
      return NextResponse.json({ error: 'Person not found.' }, { status: 404 })
    }

    const result = await linkSimilarEventFacesToPerson({ personId, eventId, scanOffset })
    const updatedPerson = await getPersonById(personId)

    return NextResponse.json({
      ...result,
      person: updatedPerson,
    })
  } catch (error) {
    console.error('[find-more]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to find more photos.' },
      { status: 500 },
    )
  }
}
