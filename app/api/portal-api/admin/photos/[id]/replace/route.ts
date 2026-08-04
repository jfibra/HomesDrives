import { NextResponse } from 'next/server'

import {
  createPortalPhotoReplacePresign,
  replacePortalPhoto,
  replacePortalPhotoFromStorage,
  requirePortalAdmin,
} from '@/lib/portals/storage'
import { enqueuePhotoFaceProcessing, resetPhotoFaceScanState } from '@/lib/server/face-pipeline'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''

    if (contentType.includes('application/json')) {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
      const adminCode = typeof body?.adminCode === 'string' ? body.adminCode.trim() : ''
      if (!adminCode) {
        return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
      }

      await requirePortalAdmin(adminCode)

      if (body?.action === 'presign') {
        const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : ''
        const fileContentType =
          typeof body.contentType === 'string' && body.contentType.trim()
            ? body.contentType.trim()
            : 'application/octet-stream'
        const fileSizeBytes =
          typeof body.fileSizeBytes === 'number' && Number.isFinite(body.fileSizeBytes)
            ? Math.max(0, Math.floor(body.fileSizeBytes))
            : 0

        if (!fileName || fileSizeBytes <= 0) {
          return NextResponse.json({ error: 'Missing file details for upload.' }, { status: 400 })
        }

        const upload = await createPortalPhotoReplacePresign({
          photoId: id,
          fileName,
          contentType: fileContentType,
          fileSizeBytes,
        })
        return NextResponse.json({ upload })
      }

      const bucketName = typeof body?.bucketName === 'string' ? body.bucketName.trim() : ''
      const storagePath = typeof body?.storagePath === 'string' ? body.storagePath.trim() : ''
      const fileContentType =
        typeof body?.contentType === 'string' && body.contentType.trim()
          ? body.contentType.trim()
          : 'application/octet-stream'
      const fileName = typeof body?.fileName === 'string' ? body.fileName.trim() : 'photo.jpg'
      const fileSizeBytes =
        typeof body?.fileSizeBytes === 'number' && Number.isFinite(body.fileSizeBytes)
          ? Math.max(0, Math.floor(body.fileSizeBytes))
          : 0

      if (!bucketName || !storagePath || fileSizeBytes <= 0) {
        return NextResponse.json({ error: 'Missing storage upload details.' }, { status: 400 })
      }

      const photo = await replacePortalPhotoFromStorage({
        id,
        bucketName,
        storagePath,
        contentType: fileContentType,
        fileName,
        fileSizeBytes,
      })
      await resetPhotoFaceScanState(photo.id)
      enqueuePhotoFaceProcessing(photo.id)
      return NextResponse.json({ photo })
    }

    const formData = await request.formData()
    const adminCode = formData.get('adminCode')?.toString().trim() ?? ''
    const file = formData.get('file')

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing replacement image file.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)
    const photo = await replacePortalPhoto(id, file)
    await resetPhotoFaceScanState(photo.id)
    enqueuePhotoFaceProcessing(photo.id)
    return NextResponse.json({ photo })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to replace photo.'
    const status = /forbidden|not active|not found/i.test(message)
      ? 403
      : /must be .+ or smaller/i.test(message)
        ? 413
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}
