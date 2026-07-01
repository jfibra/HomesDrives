import { NextResponse } from 'next/server'

import { PHOTOGRAPHER_PORTAL_CODE } from '@/lib/portals/constants'
import { assertPortalFolderInEvent } from '@/lib/portals/events'
import { requirePhotographerSessionFromRequest } from '@/lib/portals/require-photographer-access'
import { listPortalPhotos, uploadPortalPhoto } from '@/lib/portals/storage'
import { inferPortalContentType } from '@/lib/portals/upload-file-utils'
import { enqueuePhotoFaceProcessing } from '@/lib/server/face-pipeline'

export const runtime = 'nodejs'
export const maxDuration = 300

function accessErrorStatus(message: string) {
  return /access denied|incorrect pin|6-digit|session expired|full name/i.test(message) ? 401 : 500
}

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

    const { event, photographer } = await requirePhotographerSessionFromRequest(request, eventSlug)
    await assertPortalFolderInEvent(id, event.id)
    const photos = await listPortalPhotos(id, { portalPhotographerId: photographer.id })
    return NextResponse.json({ photos })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load photos.'
    return NextResponse.json({ error: message }, { status: accessErrorStatus(message) })
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

    const accessBody = {
      accessToken:
        typeof formData.get('accessToken') === 'string'
          ? String(formData.get('accessToken')).trim()
          : '',
      photographerId:
        typeof formData.get('photographerId') === 'string'
          ? String(formData.get('photographerId')).trim()
          : '',
    }
    const { event, photographer } = await requirePhotographerSessionFromRequest(
      request,
      eventSlug,
      accessBody,
    )
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
          portalPhotographerId: photographer.id,
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

    for (const photo of uploaded) {
      enqueuePhotoFaceProcessing(photo.id)
    }

    return NextResponse.json({
      photos: uploaded,
      uploadedCount: uploaded.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to upload photos.'
    return NextResponse.json(
      { error: message },
      { status: /access denied|incorrect pin|6-digit|session expired|full name/i.test(message) ? 401 : 500 },
    )
  }
}
