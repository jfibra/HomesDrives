import { NextResponse } from 'next/server'

import { MAX_AVATAR_UPLOAD_BYTES } from '@/lib/photo-upload-limits'
import {
  buildPublicImageUrl,
  getUserByCode,
  setAlbumUserAvatarUrl,
  uploadAvatarObject,
} from '@/lib/server/albums'
import { compressAvatarImage } from '@/lib/server/photo-compress'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const uploaderCodeRaw = formData.get('uploaderCode')
    const uploaderCode =
      typeof uploaderCodeRaw === 'string' ? uploaderCodeRaw.trim() : ''

    if (!uploaderCode) {
      return NextResponse.json({ error: 'Missing uploaderCode.' }, { status: 400 })
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing image file.' }, { status: 400 })
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Avatar must be an image file.' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    if (buf.length > MAX_AVATAR_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: `Avatar must be ${MAX_AVATAR_UPLOAD_BYTES / (1024 * 1024)} MB or smaller.`,
        },
        { status: 413 },
      )
    }

    const user = await getUserByCode(uploaderCode)
    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 })
    }
    if (user.status !== 'active') {
      return NextResponse.json({ error: 'Account is not active.' }, { status: 403 })
    }
    if (user.role !== 'media' && user.role !== 'customer') {
      return NextResponse.json(
        { error: 'Only media and customer accounts can upload an avatar.' },
        { status: 403 },
      )
    }

    const { buffer: jpeg } = await compressAvatarImage(buf)
    const processed = Buffer.from(jpeg)

    const uploaded = await uploadAvatarObject({
      fileBuffer: processed,
      userCode: uploaderCode,
    })

    const avatarUrl = buildPublicImageUrl(uploaded.bucketName, uploaded.storagePath)
    await setAlbumUserAvatarUrl({
      userId: user.id,
      code: uploaderCode,
      avatarUrl,
    })

    return NextResponse.json({ avatarUrl })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Unable to upload avatar right now.',
      },
      { status: 500 },
    )
  }
}

