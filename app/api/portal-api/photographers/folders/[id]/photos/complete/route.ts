import { NextResponse } from 'next/server'

import { PHOTOGRAPHER_PORTAL_CODE } from '@/lib/portals/constants'
import { requirePortalEventBySlug } from '@/lib/portals/events'
import { registerPortalPhotoUploads } from '@/lib/portals/storage'

export const runtime = 'nodejs'

type CompleteRequestBody = {
  eventSlug?: string
  uploads?: Array<{
    bucketName?: string
    contentType?: string
    fileName?: string
    fileSizeBytes?: number
    multipart?: {
      parts?: Array<{
        eTag?: string
        partNumber?: number
      }>
      uploadId?: string
    }
    storagePath?: string
  }>
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const body = (await request.json().catch(() => null)) as CompleteRequestBody | null
    const eventSlug = body?.eventSlug?.trim() ?? ''
    const uploads = body?.uploads ?? []

    if (!eventSlug) {
      return NextResponse.json({ error: 'Missing eventSlug.' }, { status: 400 })
    }

    const event = await requirePortalEventBySlug(eventSlug)
    const photos = await registerPortalPhotoUploads({
      folderId: id,
      uploaderCode: PHOTOGRAPHER_PORTAL_CODE,
      eventId: event.id,
      uploads: uploads.map((upload) => ({
        fileName: upload.fileName?.trim() || 'upload',
        contentType: upload.contentType?.trim() || 'application/octet-stream',
        fileSizeBytes: Number(upload.fileSizeBytes) || 0,
        bucketName: upload.bucketName?.trim() || '',
        storagePath: upload.storagePath?.trim() || '',
        multipart: upload.multipart?.uploadId
          ? {
              uploadId: upload.multipart.uploadId.trim(),
              parts: (upload.multipart.parts ?? [])
                .map((part) => ({
                  partNumber: Number(part.partNumber) || 0,
                  eTag: part.eTag?.trim() || '',
                }))
                .filter((part) => part.partNumber > 0 && part.eTag),
            }
          : undefined,
      })),
    })

    return NextResponse.json({ photos, uploadedCount: photos.length })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to complete upload.' },
      { status: 500 },
    )
  }
}
