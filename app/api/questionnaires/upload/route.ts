import { PutObjectCommand } from '@aws-sdk/client-s3'
import { NextResponse } from 'next/server'

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

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const questionnaireName =
      typeof formData.get('questionnaireName') === 'string'
        ? String(formData.get('questionnaireName'))
        : 'questionnaire'

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file.' }, { status: 400 })
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const now = new Date()
    const year = String(now.getFullYear())
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const namePrefix = sanitizePathPart(questionnaireName) || 'questionnaire'
    const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : ''
    const fileName = `${crypto.randomUUID().slice(0, 8)}-${namePrefix}${extension}`

    const storagePath = `homesph/questionnaires/${year}/${month}/${day}/${fileName}`
    const bucketName = getBucketName()
    const storageClient = createStorageClient()

    await storageClient.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: storagePath,
        Body: fileBuffer,
        ContentType: file.type || 'application/octet-stream',
      }),
    )

    return NextResponse.json({
      file: {
        bucket: bucketName,
        path: storagePath,
        url: buildPublicImageUrl(bucketName, storagePath),
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to upload file.',
      },
      { status: 500 },
    )
  }
}
