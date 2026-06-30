import { NextResponse } from 'next/server'

import { detachPhotoFromPerson, detachPhotosFromPerson } from '@/lib/faces'
import { getPersonById } from '@/lib/people'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ id: string }>
}

function readPhotoIds(body: Record<string, unknown> | null): string[] {
  if (!body) return []

  if (Array.isArray(body.photoIds)) {
    return body.photoIds
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean)
  }

  if (typeof body.photoId === 'string' && body.photoId.trim()) {
    return [body.photoId.trim()]
  }

  return []
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: personId } = await context.params
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const photoIds = readPhotoIds(body)

    if (photoIds.length === 0) {
      return NextResponse.json({ error: 'Missing photoId or photoIds.' }, { status: 400 })
    }

    const person = await getPersonById(personId)
    if (!person) {
      return NextResponse.json({ error: 'Person not found.' }, { status: 404 })
    }

    const result =
      photoIds.length === 1
        ? await (async () => {
            const single = await detachPhotoFromPerson({ personId, photoId: photoIds[0] })
            return {
              detached: 1,
              movedFaces: single.movedFaces,
              newPersonIds: [single.newPersonId],
            }
          })()
        : await detachPhotosFromPerson({ personId, photoIds })

    const updatedPerson = await getPersonById(personId)

    return NextResponse.json({
      person: updatedPerson,
      detached: result.detached,
      movedFaces: result.movedFaces,
      newPersonIds: result.newPersonIds,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to detach photo.' },
      { status: 500 },
    )
  }
}
