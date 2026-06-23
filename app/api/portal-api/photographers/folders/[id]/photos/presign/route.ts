import { NextResponse } from 'next/server'

import { PHOTOGRAPHER_PORTAL_CODE } from '@/lib/portals/constants'
import { requirePortalEventBySlug } from '@/lib/portals/events'
import { createPortalUploadPresigns } from '@/lib/portals/storage'
import { inferPortalContentType } from '@/lib/portals/upload-file-utils'

export const runtime = 'nodejs'

type PresignRequestBody = {
  eventSlug?: string
  files?: Array<{
    contentType?: string
    fileName?: string
    fileSizeBytes?: number
  }>
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const body = (await request.json().catch(() => null)) as PresignRequestBody | null
    const eventSlug = body?.eventSlug?.trim() ?? ''
    const files = body?.files ?? []

    if (!eventSlug) {
      return NextResponse.json({ error: 'Missing eventSlug.' }, { status: 400 })
    }

    const event = await requirePortalEventBySlug(eventSlug)
    const uploads = await createPortalUploadPresigns({
      folderId: id,
      uploaderCode: PHOTOGRAPHER_PORTAL_CODE,
      eventId: event.id,
      files: files.map((file) => ({
        fileName: file.fileName?.trim() || 'upload',
        contentType: inferPortalContentType(
          file.fileName?.trim() || 'upload',
          file.contentType?.trim() || '',
        ),
        fileSizeBytes: Number(file.fileSizeBytes) || 0,
      })),
    })

    return NextResponse.json({ uploads })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to prepare upload.' },
      { status: 500 },
    )
  }
}
