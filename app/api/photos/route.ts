import { NextResponse } from 'next/server'

import {
  buildPublicImageUrl,
  deleteImageObject,
  getAlbumFolderContext,
  getUserByCode,
  insertAlbumPhotoRow,
  listPhotosByUploader,
  uploadImageObject,
} from '@/lib/server/albums'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const uploader = searchParams.get('uploader')?.trim()
    const uploaderCode = searchParams.get('uploaderCode')?.trim()

    if (!uploader && !uploaderCode) {
      return NextResponse.json({ error: 'Missing uploader or uploaderCode parameter.' }, { status: 400 })
    }

    const photos = await listPhotosByUploader({
      uploaderCode,
      uploaderName: uploader || '',
    })
    return NextResponse.json({ photos })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load photos right now.' },
      { status: 500 },
    )
  }
}

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
    const uploaderCode = formData.get('uploaderCode')
    const folderId = formData.get('folderId')
    const metadataValue = formData.get('metadata')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing image file.' }, { status: 400 })
    }

    if (typeof uploaderName !== 'string' || !uploaderName.trim()) {
      return NextResponse.json({ error: 'Missing uploader name.' }, { status: 400 })
    }

    if (typeof uploaderCode !== 'string' || !uploaderCode.trim()) {
      return NextResponse.json({ error: 'Missing uploader code.' }, { status: 400 })
    }

    if (typeof metadataValue !== 'string') {
      return NextResponse.json({ error: 'Missing image metadata.' }, { status: 400 })
    }

    if (folderId != null && typeof folderId !== 'string') {
      return NextResponse.json({ error: 'Invalid folder id.' }, { status: 400 })
    }

    const metadata = JSON.parse(metadataValue)
    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const trimmedUploaderName = uploaderName.trim()
    const trimmedUploaderCode = uploaderCode.trim()
    const trimmedFolderId = typeof folderId === 'string' && folderId.trim() ? folderId.trim() : null

    const user = await getUserByCode(trimmedUploaderCode)
    if (!user) {
      return NextResponse.json({ error: 'Invalid uploader code.' }, { status: 404 })
    }

    if (user.full_name !== trimmedUploaderName) {
      return NextResponse.json({ error: 'Uploader name does not match uploader code.' }, { status: 403 })
    }

    const folderContext = trimmedFolderId
      ? await getAlbumFolderContext({
          folderId: trimmedFolderId,
          uploaderCode: trimmedUploaderCode,
          uploaderName: trimmedUploaderName,
        })
      : null

    if (trimmedFolderId && !folderContext) {
      return NextResponse.json({ error: 'Folder not found for this user.' }, { status: 404 })
    }

    const forwarded = request.headers.get('x-forwarded-for')
    const uploaderIp = forwarded
      ? forwarded.split(',')[0].trim()
      : (request.headers.get('x-real-ip') ?? null)
    const uploaderUserAgent = request.headers.get('user-agent') ?? null

    uploadedObject = await uploadImageObject({
      contentType: file.type,
      fileBuffer,
      fileName: file.name,
      uploaderName: trimmedUploaderName,
    })

    const imageUrl = buildPublicImageUrl(uploadedObject.bucketName, uploadedObject.storagePath)
    const photo = await insertAlbumPhotoRow({
      albumUserId: user.id,
      bucketName: uploadedObject.bucketName,
      folderContext,
      imageUrl,
      metadata,
      storagePath: uploadedObject.storagePath,
      uploaderCode: trimmedUploaderCode,
      uploaderName: trimmedUploaderName,
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