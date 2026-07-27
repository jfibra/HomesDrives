import { NextResponse } from 'next/server'

import { listPersonCoverFaceOptions } from '@/lib/face-cover'
import { getPersonById, setPersonCoverPreview } from '@/lib/people'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const person = await getPersonById(id)
    if (!person) {
      return NextResponse.json({ error: 'Person not found.' }, { status: 404 })
    }

    const faces = await listPersonCoverFaceOptions(id)
    return NextResponse.json({
      person,
      faces,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load face previews.' },
      { status: 500 },
    )
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const body = await request.json().catch(() => null)
    const faceThumbnailUrl =
      typeof body?.faceThumbnailUrl === 'string' ? body.faceThumbnailUrl.trim() : null
    const locked = body?.locked !== false && body?.auto !== true

    const existing = await getPersonById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Person not found.' }, { status: 404 })
    }

    if (locked) {
      if (!faceThumbnailUrl) {
        return NextResponse.json({ error: 'Choose a face preview photo.' }, { status: 400 })
      }
      const faces = await listPersonCoverFaceOptions(id, { limit: 96 })
      const allowed =
        faces.some((face) => face.face_thumbnail_url === faceThumbnailUrl) ||
        existing.cover_face_url === faceThumbnailUrl
      if (!allowed) {
        // Confirm the URL still belongs to this person (may be outside top clearest set).
        const { createSupabaseAdminClient } = await import('@/lib/server/albums')
        const supabase = createSupabaseAdminClient()
        const { data: owned, error: ownedError } = await supabase
          .from('faces')
          .select('id')
          .eq('person_id', id)
          .eq('face_thumbnail_url', faceThumbnailUrl)
          .limit(1)
        if (ownedError || !owned?.length) {
          return NextResponse.json({ error: 'That face does not belong to this person.' }, { status: 400 })
        }
      }
    }

    const person = await setPersonCoverPreview({
      personId: id,
      faceThumbnailUrl,
      locked,
    })

    return NextResponse.json({ person })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update face preview.' },
      { status: 500 },
    )
  }
}
