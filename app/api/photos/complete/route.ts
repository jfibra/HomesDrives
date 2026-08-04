import { NextResponse } from 'next/server'

import { MAX_PHOTO_UPLOAD_BYTES } from '@/lib/photo-upload-limits'
import type { UploadedImageMetadata } from '@/lib/server/albums'
import {
  assertStoredObjectByteLength,
  buildPublicImageUrl,
  deleteImageObject,
  getAlbumFolderContext,
  getUserByCode,
  insertAlbumPhotoRow,
} from '@/lib/server/albums'
import { enqueuePhotoFaceProcessing } from '@/lib/server/face-pipeline'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  let uploadedObject:
    | {
        bucketName: string
        storagePath: string
      }
    | undefined

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const uploaderName = typeof body?.uploaderName === 'string' ? body.uploaderName.trim() : ''
    const uploaderCode = typeof body?.uploaderCode === 'string' ? body.uploaderCode.trim() : ''
    const folderId =
      typeof body?.folderId === 'string' && body.folderId.trim() ? body.folderId.trim() : null
    const bucketName = typeof body?.bucketName === 'string' ? body.bucketName.trim() : ''
    const storagePath = typeof body?.storagePath === 'string' ? body.storagePath.trim() : ''
    const contentType =
      typeof body?.contentType === 'string' && body.contentType.trim()
        ? body.contentType.trim()
        : 'application/octet-stream'
    const fileSizeBytes =
      typeof body?.fileSizeBytes === 'number' && Number.isFinite(body.fileSizeBytes)
        ? Math.max(0, Math.floor(body.fileSizeBytes))
        : 0
    const metadataRaw = body?.metadata

    if (!uploaderName || !uploaderCode || !bucketName || !storagePath) {
      return NextResponse.json({ error: 'Missing upload completion details.' }, { status: 400 })
    }

    if (fileSizeBytes <= 0 || fileSizeBytes > MAX_PHOTO_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: `Each photo must be ${MAX_PHOTO_UPLOAD_BYTES / (1024 * 1024)} MB or smaller.`,
        },
        { status: 413 },
      )
    }

    if (!metadataRaw || typeof metadataRaw !== 'object') {
      return NextResponse.json({ error: 'Missing image metadata.' }, { status: 400 })
    }

    const user = await getUserByCode(uploaderCode)
    if (!user) {
      return NextResponse.json({ error: 'Invalid uploader code.' }, { status: 404 })
    }
    if (user.full_name !== uploaderName) {
      return NextResponse.json({ error: 'Uploader name does not match uploader code.' }, { status: 403 })
    }

    uploadedObject = { bucketName, storagePath }

    await assertStoredObjectByteLength({
      bucketName,
      storagePath,
      expectedBytes: fileSizeBytes,
    })

    const folderContext = folderId
      ? await getAlbumFolderContext({
          folderId,
          uploaderCode,
          uploaderName,
        })
      : null

    if (folderId && !folderContext) {
      return NextResponse.json({ error: 'Folder not found for this user.' }, { status: 404 })
    }

    const forwarded = request.headers.get('x-forwarded-for')
    const uploaderIp = forwarded
      ? forwarded.split(',')[0].trim()
      : (request.headers.get('x-real-ip') ?? null)
    const uploaderUserAgent = request.headers.get('user-agent') ?? null

    const metadata = {
      ...(metadataRaw as Record<string, unknown>),
      fileSize: fileSizeBytes,
      fileType: contentType,
    }

    const imageUrl = buildPublicImageUrl(bucketName, storagePath)
    const photo = await insertAlbumPhotoRow({
      albumUserId: user.id,
      bucketName,
      folderContext,
      imageUrl,
      metadata: metadata as UploadedImageMetadata,
      storagePath,
      uploaderCode,
      uploaderName,
      uploaderIp,
      uploaderUserAgent,
    })

    if (photo?.id) {
      enqueuePhotoFaceProcessing(String(photo.id))
    }

    return NextResponse.json({ photo })
  } catch (error) {
    if (uploadedObject) {
      await deleteImageObject(uploadedObject.bucketName, uploadedObject.storagePath).catch(() => null)
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to finish photo upload.',
      },
      { status: 500 },
    )
  }
}
