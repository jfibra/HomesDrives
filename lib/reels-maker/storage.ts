import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'
import sharp from 'sharp'

import {
  buildPublicImageUrl,
  createStorageClient,
  getStoragePrefix,
  uploadOriginalMediaObject,
} from '@/lib/server/albums'
import { DEFAULT_PRESIGN_EXPIRY_SECONDS } from '@/lib/photo-upload-limits'
import { analyzeMediaQuality, dedupeMediaByFileName } from '@/lib/reels-maker/media-quality'
import type { ReelMediaKind, ReelUploadedMedia } from '@/lib/reels-maker/types'

function getBucketName(): string {
  const bucketName = process.env.AWS_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME || ''
  if (!bucketName) {
    throw new Error('Missing AWS_S3_BUCKET.')
  }
  return bucketName
}

function buildReelsStoragePath(fileName: string) {
  const prefix = getStoragePrefix()
  const safeName = fileName.replace(/[^\w.\-]+/g, '_')
  const date = new Date()
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${prefix}/reels-maker/${year}/${month}/${randomUUID()}-${safeName}`
}

function isVideoFile(fileName: string, mimeType: string) {
  if (mimeType.startsWith('video/')) return true
  return /\.(mp4|webm|mov|m4v|mkv)$/i.test(fileName)
}

export async function createReelPresignedUpload(params: {
  fileName: string
  contentType: string
}) {
  const bucketName = getBucketName()
  const storagePath = buildReelsStoragePath(params.fileName)
  const storageClient = createStorageClient()
  const contentType = params.contentType || 'application/octet-stream'

  const uploadUrl = await getSignedUrl(
    storageClient,
    new PutObjectCommand({
      Bucket: bucketName,
      Key: storagePath,
      ContentType: contentType,
    }),
    { expiresIn: DEFAULT_PRESIGN_EXPIRY_SECONDS },
  )

  return {
    bucketName,
    storagePath,
    uploadUrl,
    contentType,
  }
}

export async function registerReelMediaFromStorage(params: {
  fileName: string
  mimeType: string
  bucketName: string
  storagePath: string
  userNote?: string
}): Promise<ReelUploadedMedia> {
  const buffer = await downloadReelObject(params.bucketName, params.storagePath)
  const kind: ReelMediaKind = isVideoFile(params.fileName, params.mimeType) ? 'video' : 'image'
  const quality = await analyzeMediaQuality(buffer, kind)

  return {
    id: randomUUID(),
    kind,
    fileName: params.fileName,
    mimeType: params.mimeType,
    bucketName: params.bucketName,
    storagePath: params.storagePath,
    publicUrl: buildPublicImageUrl(params.bucketName, params.storagePath),
    width: quality.width,
    height: quality.height,
    durationSeconds: null,
    qualityScore: quality.qualityScore,
    rejected: quality.rejected,
    rejectReason: quality.rejectReason,
    userNote: params.userNote?.trim() || undefined,
  }
}

export async function registerReelLogoFromStorage(params: {
  fileName: string
  mimeType: string
  bucketName: string
  storagePath: string
}) {
  const buffer = await downloadReelObject(params.bucketName, params.storagePath)
  return uploadReelLogoFile({
    fileName: params.fileName,
    mimeType: params.mimeType,
    buffer,
  })
}

export async function uploadReelMediaFile(params: {
  fileName: string
  mimeType: string
  buffer: Buffer
  userNote?: string
}): Promise<ReelUploadedMedia> {
  const kind: ReelMediaKind = isVideoFile(params.fileName, params.mimeType) ? 'video' : 'image'
  const quality = await analyzeMediaQuality(params.buffer, kind)
  const uploadBuffer = params.buffer
  const bucketName = getBucketName()
  const storagePath = buildReelsStoragePath(params.fileName)
  const storageClient = createStorageClient()

  await storageClient.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: storagePath,
      Body: uploadBuffer,
      ContentType: params.mimeType || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )

  return {
    id: randomUUID(),
    kind,
    fileName: params.fileName,
    mimeType: params.mimeType,
    bucketName,
    storagePath,
    publicUrl: buildPublicImageUrl(bucketName, storagePath),
    width: quality.width,
    height: quality.height,
    durationSeconds: null,
    qualityScore: quality.qualityScore,
    rejected: quality.rejected,
    rejectReason: quality.rejectReason,
    userNote: params.userNote?.trim() || undefined,
  }
}

export async function uploadReelLogoFile(params: {
  fileName: string
  mimeType: string
  buffer: Buffer
}) {
  const meta = await sharp(params.buffer, { failOn: 'none' }).metadata()
  const maxWidth = 512
  let uploadBuffer = params.buffer
  let contentType = params.mimeType || 'image/png'

  if ((meta.width ?? 0) > maxWidth) {
    const pipeline = sharp(params.buffer, { failOn: 'none' }).resize({
      width: maxWidth,
      fit: 'inside',
      withoutEnlargement: true,
    })
    if (meta.format === 'png' || params.mimeType === 'image/png') {
      uploadBuffer = await pipeline.png().toBuffer()
      contentType = 'image/png'
    } else if (meta.format === 'webp' || params.mimeType === 'image/webp') {
      uploadBuffer = await pipeline.webp({ quality: 92 }).toBuffer()
      contentType = 'image/webp'
    } else {
      uploadBuffer = await pipeline.png().toBuffer()
      contentType = 'image/png'
    }
  }

  const bucketName = getBucketName()
  const storagePath = buildReelsStoragePath(params.fileName)
  const storageClient = createStorageClient()

  await storageClient.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: storagePath,
      Body: uploadBuffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )

  return {
    bucketName,
    storagePath,
    publicUrl: buildPublicImageUrl(bucketName, storagePath),
  }
}

export async function uploadReelMusicFile(params: {
  fileName: string
  mimeType: string
  buffer: Buffer
}) {
  const uploaded = await uploadOriginalMediaObject({
    contentType: params.mimeType || 'audio/mpeg',
    fileBuffer: params.buffer,
    fileName: params.fileName,
    uploaderName: 'Reels Maker',
  })
  return {
    bucketName: uploaded.bucketName,
    storagePath: uploaded.storagePath,
    publicUrl: buildPublicImageUrl(uploaded.bucketName, uploaded.storagePath),
  }
}

export async function uploadRenderedReel(buffer: Buffer) {
  const bucketName = getBucketName()
  const storagePath = buildReelsStoragePath('reel-output.mp4')
  const storageClient = createStorageClient()

  await storageClient.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: storagePath,
      Body: buffer,
      ContentType: 'video/mp4',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )

  return buildPublicImageUrl(bucketName, storagePath)
}

export async function downloadReelObject(bucketName: string, storagePath: string) {
  const storageClient = createStorageClient()
  const response = await storageClient.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: storagePath,
    }),
  )
  const bytes = await response.Body?.transformToByteArray()
  if (!bytes?.length) {
    throw new Error(`Unable to download object: ${storagePath}`)
  }
  return Buffer.from(bytes)
}

export function selectBestMedia(media: ReelUploadedMedia[]) {
  if (!media.length) return []

  const deduped = dedupeMediaByFileName(media)
  const accepted = deduped.filter((item) => !item.rejected)
  const ranked = (accepted.length ? accepted : deduped).sort((a, b) => b.qualityScore - a.qualityScore)

  return ranked.slice(0, 8)
}
