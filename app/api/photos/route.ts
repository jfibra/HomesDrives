import { NextResponse } from 'next/server'

import {
  buildPublicImageUrl,
  deleteImageObject,
  insertAlbumPhotoRow,
  uploadImageObject,
} from '@/lib/server/albums'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  let uploadedObject:
    | {
        bucketName: string
        storagePath: string
      }
    | undefined

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const uploaderName = formData.get('uploaderName')
    const metadataValue = formData.get('metadata')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing image file.' }, { status: 400 })
    }

    if (typeof uploaderName !== 'string' || !uploaderName.trim()) {
      return NextResponse.json({ error: 'Missing uploader name.' }, { status: 400 })
    }

    if (typeof metadataValue !== 'string') {
      return NextResponse.json({ error: 'Missing image metadata.' }, { status: 400 })
    }

    const metadata = JSON.parse(metadataValue)
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const forwarded = request.headers.get('x-forwarded-for')
    const uploaderIp = forwarded
      ? forwarded.split(',')[0].trim()
      : (request.headers.get('x-real-ip') ?? null)
    const uploaderUserAgent = request.headers.get('user-agent') ?? null

    uploadedObject = await uploadImageObject({
      contentType: file.type,
      fileBuffer,
      fileName: file.name,
      uploaderName: uploaderName.trim(),
    })

    const imageUrl = buildPublicImageUrl(uploadedObject.bucketName, uploadedObject.storagePath)
    const photo = await insertAlbumPhotoRow({
      bucketName: uploadedObject.bucketName,
      imageUrl,
      metadata,
      storagePath: uploadedObject.storagePath,
      uploaderName: uploaderName.trim(),
      uploaderIp,
      uploaderUserAgent,
    })

    return NextResponse.json({ photo })
  } catch (error) {
    if (uploadedObject) {
      await deleteImageObject(uploadedObject.bucketName, uploadedObject.storagePath).catch(() => null)
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Unable to upload the photo right now.',
      },
      { status: 500 },
    )
  }
}