import { PutObjectCommand } from '@aws-sdk/client-s3'
import { NextResponse } from 'next/server'

import { getPortalEventById, updatePortalEvent } from '@/lib/portals/events'
import { requirePortalAdmin } from '@/lib/portals/storage'
import { buildPublicImageUrl, createStorageClient } from '@/lib/server/albums'

export const runtime = 'nodejs'

function sanitizePathPart(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function getBucketName() {
  return process.env.AWS_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME || 'filipinohomes123'
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const formData = await request.formData()
    const file = formData.get('file')
    const adminCode =
      typeof formData.get('adminCode') === 'string' ? String(formData.get('adminCode')).trim() : ''

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }
    if (!id) {
      return NextResponse.json({ error: 'Missing event id.' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file.' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)
    const portalEvent = await getPortalEventById(id)
    if (!portalEvent) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const slugPrefix = sanitizePathPart(portalEvent.slug) || 'event'
    const extension = file.name.includes('.')
      ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
      : ''
    const fileName = `qr-logo-${crypto.randomUUID().slice(0, 8)}-${slugPrefix}${extension}`
    const storagePath = `homesph/portal-events/${slugPrefix}/${fileName}`
    const bucketName = getBucketName()
    const storageClient = createStorageClient()

    await storageClient.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: storagePath,
        Body: fileBuffer,
        ContentType: file.type || 'image/png',
      }),
    )

    const qrLogoUrl = buildPublicImageUrl(bucketName, storagePath)
    const event = await updatePortalEvent(id, { qrLogoUrl })

    return NextResponse.json({ event })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to upload QR logo.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
