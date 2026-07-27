import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'

import {
  buildPublicImageUrl,
  createStorageClient,
  createSupabaseAdminClient,
  getStoragePrefix,
} from '@/lib/server/albums'
import { deleteFacesForPhoto, insertFace } from '@/lib/faces'
import { dedupeBySpatialOverlap, boundingBoxArea } from '@/lib/face-dedupe'
import { isFaceBoundingBoxShapeOk, isFaceCropAcceptable } from '@/lib/face-quality'
import { detectFacesInImage } from '@/lib/server/insightface-client'
import { normalizeBoundingBox } from '@/lib/face-geometry'
import { ensurePersonNameFromPhotoIfUnknown } from '@/lib/people'
import { derivePersonNameFromFileName } from '@/lib/person-name-from-file'
import { matchOrCreatePerson, isMatchSkipped } from '@/lib/vector-search'
import type { DetectedFace } from '@/lib/types/people'
import { cosineSimilarity } from '@/lib/face-similarity'

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|bmp|gif|heic|heif|avif)$/i
const MIN_PIPELINE_FACE_CONFIDENCE = Number.parseFloat(
  process.env.FACE_PIPELINE_MIN_CONFIDENCE ?? '0.70',
)
/** Find-more / deep-match use the same confidence bar — no hands or soft false positives. */
const FIND_MORE_MIN_DETECTION_CONFIDENCE = Number.parseFloat(
  process.env.FACE_FIND_MORE_MIN_CONFIDENCE ?? String(MIN_PIPELINE_FACE_CONFIDENCE),
)

type PhotoRow = {
  id: string
  folder_id: string
  bucket_name: string
  storage_path: string
  image_url: string
  original_file_name: string
  width: number | null
  height: number | null
  file_type: string | null
}

async function getPhotoEventId(photo: PhotoRow): Promise<string | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('albums_folders')
    .select('portal_event_id')
    .eq('id', photo.folder_id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data?.portal_event_id ? String(data.portal_event_id) : null
}

function isProcessableImage(photo: PhotoRow) {
  const fileType = photo.file_type?.toLowerCase() ?? ''
  if (fileType.startsWith('image/')) return true
  return IMAGE_EXTENSIONS.test(photo.original_file_name)
}

async function downloadPhotoBuffer(photo: PhotoRow): Promise<Buffer> {
  const storageClient = createStorageClient()
  const response = await storageClient.send(
    new GetObjectCommand({
      Bucket: photo.bucket_name,
      Key: photo.storage_path,
    }),
  )

  const bytes = await response.Body?.transformToByteArray()
  if (!bytes?.length) {
    throw new Error('Unable to download photo bytes from storage.')
  }

  return Buffer.from(bytes)
}

async function uploadFaceThumbnail(params: {
  buffer: Buffer
  photoId: string
  faceIndex: number
}): Promise<string> {
  const storageClient = createStorageClient()
  const bucketName = process.env.AWS_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME || ''
  if (!bucketName) {
    throw new Error('Missing AWS_S3_BUCKET.')
  }

  const prefix = getStoragePrefix()
  const key = `${prefix}/faces/${params.photoId}/${params.faceIndex}-${crypto.randomUUID().slice(0, 8)}.jpg`

  await storageClient.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: params.buffer,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )

  return buildPublicImageUrl(bucketName, key)
}

function createSharpInput(buffer: Buffer) {
  return sharp(buffer, { failOn: 'none', unlimited: true })
}

async function repairImageBuffer(imageBuffer: Buffer): Promise<Buffer> {
  return createSharpInput(imageBuffer).jpeg({ quality: 95, mozjpeg: true }).toBuffer()
}

async function cropFaceThumbnail(
  imageBuffer: Buffer,
  bbox: DetectedFace['bounding_box'],
): Promise<Buffer> {
  const attemptCrop = async (buffer: Buffer) => {
    const meta = await createSharpInput(buffer).metadata()
    const width = meta.width ?? 1
    const height = meta.height ?? 1
    const box = normalizeBoundingBox(bbox, width, height)

    const left = Math.max(0, Math.min(Math.floor(box.x), width - 1))
    const top = Math.max(0, Math.min(Math.floor(box.y), height - 1))
    const cropWidth = Math.max(1, Math.min(Math.ceil(box.width), width - left))
    const cropHeight = Math.max(1, Math.min(Math.ceil(box.height), height - top))

    return createSharpInput(buffer)
      .extract({
        left,
        top,
        width: cropWidth,
        height: cropHeight,
      })
      .resize(256, 256, { fit: 'cover' })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer()
  }

  try {
    return await attemptCrop(imageBuffer)
  } catch {
    const repaired = await repairImageBuffer(imageBuffer)
    return await attemptCrop(repaired)
  }
}

async function markPhotoFacesScanned(photoId: string) {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('albums_photos')
    .update({ faces_scanned_at: new Date().toISOString() })
    .eq('id', photoId)

  if (error) {
    console.warn('[face-pipeline] unable to mark photo scanned:', error.message)
  }
}

export async function processPhotoFaces(photoId: string): Promise<{ facesDetected: number }> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('albums_photos')
    .select(
      'id, folder_id, bucket_name, storage_path, image_url, original_file_name, width, height, file_type',
    )
    .eq('id', photoId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Photo not found.')

  const photo = data as PhotoRow
  if (!isProcessableImage(photo)) {
    await markPhotoFacesScanned(photoId)
    return { facesDetected: 0 }
  }

  const { isPhotoFacesDiscarded } = await import('@/lib/face-rejections')
  if (await isPhotoFacesDiscarded(photoId)) {
    await deleteFacesForPhoto(photoId)
    await markPhotoFacesScanned(photoId)
    return { facesDetected: 0 }
  }

  const eventId = await getPhotoEventId(photo)

  await deleteFacesForPhoto(photoId)

  const imageBuffer = await downloadPhotoBuffer(photo)
  const detectedFaces = dedupeBySpatialOverlap(await detectFacesInImage(imageBuffer))

  if (detectedFaces.length === 0) {
    await markPhotoFacesScanned(photoId)
    return { facesDetected: 0 }
  }

  const suggestedName = derivePersonNameFromFileName(photo.original_file_name)
  const { listRejectedPersonIdsForPhoto } = await import('@/lib/face-rejections')
  const rejectedPersonIds = await listRejectedPersonIdsForPhoto(photoId)
  const bestByPerson = new Map<
    string,
    { detectedFace: DetectedFace; faceThumbnailUrl: string | null }
  >()

  for (let index = 0; index < detectedFaces.length; index++) {
    const detectedFace = detectedFaces[index]
    let faceThumbnailUrl: string | null = null
    let thumbBuffer: Buffer | null = null

    try {
      thumbBuffer = await cropFaceThumbnail(imageBuffer, detectedFace.bounding_box)
      if (!isFaceBoundingBoxShapeOk(detectedFace.bounding_box)) {
        console.info(`[face-pipeline] skipping non-face shape on ${photoId}`)
        continue
      }
      const quality = await isFaceCropAcceptable(thumbBuffer)
      if (!quality.ok) {
        console.info(
          `[face-pipeline] skipping low-quality face on ${photoId}: ${quality.reason} (sharpness=${quality.sharpness.toFixed(1)})`,
        )
        continue
      }
      faceThumbnailUrl = await uploadFaceThumbnail({
        buffer: thumbBuffer,
        photoId,
        faceIndex: index + 1,
      })
    } catch (thumbError) {
      console.warn('[face-pipeline] thumbnail upload failed:', thumbError)
      continue
    }

    // Weak detections create noisy embeddings → duplicate "people". Skip instead of inventing a person.
    if ((detectedFace.confidence ?? 0) < MIN_PIPELINE_FACE_CONFIDENCE) {
      console.info(
        `[face-pipeline] skipping low-confidence face on ${photoId}: confidence=${detectedFace.confidence}`,
      )
      continue
    }

    const match = await matchOrCreatePerson({
      embedding: detectedFace.embedding,
      eventId,
      suggestedName,
      detectionConfidence: detectedFace.confidence ?? null,
    })

    if (isMatchSkipped(match)) {
      console.info(`[face-pipeline] skipping face on ${photoId}: ${match.reason}`)
      continue
    }

    if (!match.isNewPerson && rejectedPersonIds.has(match.personId)) {
      // User marked this photo as "No face here" for this person — never re-link.
      continue
    }

    if (!match.isNewPerson && photo.original_file_name) {
      await ensurePersonNameFromPhotoIfUnknown(match.personId, photo.original_file_name)
    }

    const existing = bestByPerson.get(match.personId)
    const existingScore = existing
      ? {
          confidence: existing.detectedFace.confidence ?? -1,
          area: boundingBoxArea(existing.detectedFace.bounding_box),
        }
      : null
    const nextScore = {
      confidence: detectedFace.confidence ?? -1,
      area: boundingBoxArea(detectedFace.bounding_box),
    }
    const isBetter =
      !existingScore ||
      nextScore.confidence > existingScore.confidence ||
      (nextScore.confidence === existingScore.confidence && nextScore.area > existingScore.area)

    if (isBetter) {
      bestByPerson.set(match.personId, { detectedFace, faceThumbnailUrl })
    }
  }

  for (const [personId, matched] of bestByPerson) {
    await insertFace({
      photoId,
      personId,
      embedding: matched.detectedFace.embedding,
      faceThumbnailUrl: matched.faceThumbnailUrl,
      boundingBox: matched.detectedFace.bounding_box,
      confidence: matched.detectedFace.confidence ?? null,
    })
  }

  await markPhotoFacesScanned(photoId)
  return { facesDetected: bestByPerson.size }
}

/** Detect faces in a photo and link matches to a known person without removing other tags. */
export async function linkPersonInPhotoIfMatch(params: {
  photoId: string
  personId: string
  referenceEmbedding: number[]
  threshold: number
}): Promise<{ linkedFaces: number }> {
  const { isFaceRejectedForPerson, isPhotoFacesDiscarded } = await import('@/lib/face-rejections')

  if (await isPhotoFacesDiscarded(params.photoId)) {
    return { linkedFaces: 0 }
  }
  if (await isFaceRejectedForPerson(params.photoId, params.personId)) {
    return { linkedFaces: 0 }
  }

  const supabase = createSupabaseAdminClient()
  const { data: existingPersonFace, error: existingError } = await supabase
    .from('faces')
    .select('id')
    .eq('photo_id', params.photoId)
    .eq('person_id', params.personId)
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)
  if (existingPersonFace) {
    return { linkedFaces: 0 }
  }

  const { data, error } = await supabase
    .from('albums_photos')
    .select(
      'id, folder_id, bucket_name, storage_path, image_url, original_file_name, width, height, file_type',
    )
    .eq('id', params.photoId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return { linkedFaces: 0 }

  const photo = data as PhotoRow
  if (!isProcessableImage(photo)) {
    return { linkedFaces: 0 }
  }

  const imageBuffer = await downloadPhotoBuffer(photo)
  const detectedFaces = dedupeBySpatialOverlap(await detectFacesInImage(imageBuffer))
  if (detectedFaces.length === 0) {
    return { linkedFaces: 0 }
  }

  let bestMatch: {
    detectedFace: DetectedFace
    faceThumbnailUrl: string | null
    similarity: number
  } | null = null

  for (let index = 0; index < detectedFaces.length; index++) {
    const detectedFace = detectedFaces[index]
    if (!isFaceBoundingBoxShapeOk(detectedFace.bounding_box)) {
      continue
    }
    if ((detectedFace.confidence ?? 0) < FIND_MORE_MIN_DETECTION_CONFIDENCE) {
      continue
    }

    const similarity = cosineSimilarity(detectedFace.embedding, params.referenceEmbedding)
    if (similarity < params.threshold) {
      continue
    }

    let faceThumbnailUrl: string | null = null
    try {
      const thumbBuffer = await cropFaceThumbnail(imageBuffer, detectedFace.bounding_box)
      const quality = await isFaceCropAcceptable(thumbBuffer)
      if (!quality.ok) {
        continue
      }
      faceThumbnailUrl = await uploadFaceThumbnail({
        buffer: thumbBuffer,
        photoId: params.photoId,
        faceIndex: index + 1,
      })
    } catch {
      continue
    }

    if (!bestMatch || similarity > bestMatch.similarity) {
      bestMatch = { detectedFace, faceThumbnailUrl, similarity }
    }
  }

  if (!bestMatch) {
    return { linkedFaces: 0 }
  }

  await insertFace({
    photoId: params.photoId,
    personId: params.personId,
    embedding: bestMatch.detectedFace.embedding,
    faceThumbnailUrl: bestMatch.faceThumbnailUrl,
    boundingBox: bestMatch.detectedFace.bounding_box,
    confidence: bestMatch.detectedFace.confidence ?? null,
  })

  return { linkedFaces: 1 }
}

export async function resetPhotoFaceScanState(photoId: string): Promise<void> {
  await deleteFacesForPhoto(photoId)

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('albums_photos')
    .update({ faces_scanned_at: null })
    .eq('id', photoId)

  if (error && !/faces_scanned_at|does not exist|schema cache/i.test(error.message)) {
    throw new Error(error.message)
  }
}

export function enqueuePhotoFaceProcessing(photoId: string) {
  void processPhotoFaces(photoId).catch((error) => {
    console.error(`[face-pipeline] failed for photo ${photoId}:`, error)
  })
}
