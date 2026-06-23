import { NextResponse } from 'next/server'

import { PHOTOGRAPHER_PORTAL_CODE } from '@/lib/portals/constants'
import { assertPortalFolderInEvent, requirePortalEventBySlug } from '@/lib/portals/events'
import { listPortalPhotos, uploadPortalPhoto } from '@/lib/portals/storage'
import { inferPortalContentType } from '@/lib/portals/upload-file-utils'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const { searchParams } = new URL(request.url)
    const eventSlug = searchParams.get('eventSlug')?.trim() ?? ''
    if (!eventSlug) {
      return NextResponse.json({ error: 'Missing eventSlug.' }, { status: 400 })
    }

    const event = await requirePortalEventBySlug(eventSlug)
    await assertPortalFolderInEvent(id, event.id)
    const photos = await listPortalPhotos(id)
    return NextResponse.json({ photos })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load photos.' },
      { status: 500 },
    )
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const formData = await request.formData()
    const eventSlug =
      typeof formData.get('eventSlug') === 'string' ? String(formData.get('eventSlug')).trim() : ''
    const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File)

    if (!eventSlug) {
      return NextResponse.json({ error: 'Missing eventSlug.' }, { status: 400 })
    }
    if (files.length === 0) {
      return NextResponse.json({ error: 'Choose at least one file.' }, { status: 400 })
    }

    const event = await requirePortalEventBySlug(eventSlug)
    await assertPortalFolderInEvent(id, event.id)

    const uploaded = []
    const errors: Array<{ fileName: string; error: string }> = []

    for (const file of files) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer())
        const photo = await uploadPortalPhoto({
          folderId: id,
          uploaderCode: PHOTOGRAPHER_PORTAL_CODE,
          fileName: file.name,
          fileBuffer: buffer,
          contentType: inferPortalContentType(file.name, file.type || ''),
          eventId: event.id,
        })
        uploaded.push(photo)
      } catch (error) {
        errors.push({
          fileName: file.name,
          error: error instanceof Error ? error.message : 'Unable to upload file.',
        })
      }
    }

    if (uploaded.length === 0) {
      const firstError = errors[0]?.error || 'Unable to upload photos.'
      return NextResponse.json({ error: firstError, errors }, { status: 500 })
    }

    return NextResponse.json({
      photos: uploaded,
      uploadedCount: uploaded.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to upload photos.' },
      { status: 500 },
    )
  }
}
