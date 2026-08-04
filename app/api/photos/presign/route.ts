import { NextResponse } from 'next/server'

import { DEFAULT_PRESIGN_EXPIRY_SECONDS, MAX_PHOTO_UPLOAD_BYTES } from '@/lib/photo-upload-limits'
import { createPresignedUploadObject, getUserByCode } from '@/lib/server/albums'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const uploaderName = typeof body?.uploaderName === 'string' ? body.uploaderName.trim() : ''
    const uploaderCode = typeof body?.uploaderCode === 'string' ? body.uploaderCode.trim() : ''
    const fileName = typeof body?.fileName === 'string' ? body.fileName.trim() : ''
    const contentType =
      typeof body?.contentType === 'string' && body.contentType.trim()
        ? body.contentType.trim()
        : 'application/octet-stream'
    const fileSizeBytes =
      typeof body?.fileSizeBytes === 'number' && Number.isFinite(body.fileSizeBytes)
        ? Math.max(0, Math.floor(body.fileSizeBytes))
        : 0

    if (!uploaderName || !uploaderCode || !fileName) {
      return NextResponse.json({ error: 'Missing upload details.' }, { status: 400 })
    }

    if (fileSizeBytes <= 0) {
      return NextResponse.json({ error: 'Invalid file size.' }, { status: 400 })
    }

    if (fileSizeBytes > MAX_PHOTO_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: `Each photo must be ${MAX_PHOTO_UPLOAD_BYTES / (1024 * 1024)} MB or smaller (received ${(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB).`,
        },
        { status: 413 },
      )
    }

    const user = await getUserByCode(uploaderCode)
    if (!user) {
      return NextResponse.json({ error: 'Invalid uploader code.' }, { status: 404 })
    }
    if (user.full_name !== uploaderName) {
      return NextResponse.json({ error: 'Uploader name does not match uploader code.' }, { status: 403 })
    }

    const presigned = await createPresignedUploadObject({
      contentType,
      expiresInSeconds: DEFAULT_PRESIGN_EXPIRY_SECONDS,
      fileName,
      uploaderName,
    })

    return NextResponse.json({
      upload: {
        uploadUrl: presigned.uploadUrl,
        bucketName: presigned.bucketName,
        storagePath: presigned.storagePath,
        contentType: presigned.contentType,
        fileName,
        fileSizeBytes,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to prepare photo upload.' },
      { status: 500 },
    )
  }
}
