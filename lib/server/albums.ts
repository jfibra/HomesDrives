import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'

type UploadedImageMetadata = {
  altitude: number | null
  aperture: number | null
  captureDate: string | null
  description: string | null
  deviceMake: string | null
  deviceModel: string | null
  exposureTime: string | null
  fileName: string
  fileSize: number
  fileType: string
  focalLength: number | null
  height: number | null
  iso: number | null
  keywords: string[]
  lastModified: string
  latitude: number | null
  lensModel: string | null
  longitude: number | null
  width: number | null
}

function getRequiredEnv(name: string) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function getBucketEnv() {
  return process.env.AWS_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME || ''
}

function getOptionalEnv(name: string) {
  const value = process.env[name]

  return value?.trim() || ''
}

function isAwsEndpoint(endpoint: string) {
  return endpoint.includes('amazonaws.com')
}

function getStoragePrefix() {
  const prefix = process.env.AWS_S3_PREFIX || 'homesph'

  return prefix
    .split('/')
    .map((segment) => sanitizePathSegment(segment))
    .filter(Boolean)
    .join('/')
}

function sanitizePathSegment(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function splitFileName(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf('.')

  if (lastDotIndex <= 0) {
    return {
      baseName: fileName,
      extension: '',
    }
  }

  return {
    baseName: fileName.slice(0, lastDotIndex),
    extension: fileName.slice(lastDotIndex).toLowerCase(),
  }
}

export function buildStoragePath(uploaderName: string, fileName: string, uploadedAt: Date) {
  const storagePrefix = getStoragePrefix()
  const safeUploaderName = sanitizePathSegment(uploaderName) || 'unknown-uploader'
  const { baseName, extension } = splitFileName(fileName)
  const safeFileName = sanitizePathSegment(baseName) || 'photo'
  const year = String(uploadedAt.getFullYear())
  const month = String(uploadedAt.getMonth() + 1).padStart(2, '0')
  const day = String(uploadedAt.getDate()).padStart(2, '0')
  const uniquePrefix = crypto.randomUUID().slice(0, 8)

  return `${storagePrefix}/albums/${safeUploaderName}/${year}/${month}/${day}/${uniquePrefix}-${safeFileName}${extension}`
}

export function createStorageClient() {
  const endpoint = getOptionalEnv('AWS_S3_ENDPOINT')
  const useAwsManagedEndpoint = !endpoint || isAwsEndpoint(endpoint)

  return new S3Client({
    region: getRequiredEnv('AWS_REGION'),
    ...(useAwsManagedEndpoint ? {} : { endpoint }),
    credentials: {
      accessKeyId: getRequiredEnv('AWS_ACCESS_KEY_ID'),
      secretAccessKey: getRequiredEnv('AWS_SECRET_ACCESS_KEY'),
    },
    forcePathStyle: !useAwsManagedEndpoint,
  })
}

export function createSupabaseAdminClient() {
  return createClient(
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}

export async function uploadImageObject(params: {
  contentType: string
  fileBuffer: Buffer
  fileName: string
  uploaderName: string
}) {
  const uploadedAt = new Date()
  const bucketName = getBucketEnv()

  if (!bucketName) {
    throw new Error('Missing required environment variable: AWS_S3_BUCKET or AWS_S3_BUCKET_NAME')
  }

  const storagePath = buildStoragePath(params.uploaderName, params.fileName, uploadedAt)
  const storageClient = createStorageClient()

  await storageClient.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: storagePath,
      Body: params.fileBuffer,
      ContentType: params.contentType || 'application/octet-stream',
    }),
  )

  return {
    bucketName,
    storagePath,
    uploadedAt,
  }
}

export async function deleteImageObject(bucketName: string, storagePath: string) {
  const storageClient = createStorageClient()

  await storageClient.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: storagePath,
    }),
  )
}

export function buildPublicImageUrl(bucketName: string, storagePath: string) {
  const endpoint = getOptionalEnv('AWS_S3_ENDPOINT').replace(/\/$/, '')
  const region = getRequiredEnv('AWS_REGION')

  if (endpoint) {
    if (isAwsEndpoint(endpoint)) {
      if (endpoint.includes(`://${bucketName}.`)) {
        return `${endpoint}/${storagePath}`
      }

      return `https://${bucketName}.s3.${region}.amazonaws.com/${storagePath}`
    }

    return `${endpoint}/${bucketName}/${storagePath}`
  }

  return `https://${bucketName}.s3.${region}.amazonaws.com/${storagePath}`
}

export async function insertAlbumPhotoRow(params: {
  bucketName: string
  imageUrl: string
  metadata: UploadedImageMetadata
  storagePath: string
  uploaderName: string
  uploaderIp: string | null
  uploaderUserAgent: string | null
}) {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('albums_photos')
    .insert({
      uploader_name: params.uploaderName,
      bucket_name: params.bucketName,
      storage_path: params.storagePath,
      image_url: params.imageUrl,
      original_file_name: params.metadata.fileName,
      file_type: params.metadata.fileType,
      file_size_bytes: params.metadata.fileSize,
      width: params.metadata.width,
      height: params.metadata.height,
      capture_date: params.metadata.captureDate,
      last_modified: params.metadata.lastModified,
      description: params.metadata.description,
      device_make: params.metadata.deviceMake,
      device_model: params.metadata.deviceModel,
      lens_model: params.metadata.lensModel,
      exposure_time: params.metadata.exposureTime,
      aperture: params.metadata.aperture,
      focal_length: params.metadata.focalLength,
      iso: params.metadata.iso,
      altitude: params.metadata.altitude,
      metadata_keywords: params.metadata.keywords,
      metadata_latitude: params.metadata.latitude,
      metadata_longitude: params.metadata.longitude,
      longitude: params.metadata.longitude,
      latitude: params.metadata.latitude,
      place_name: null,
      full_address: null,
      street: null,
      city: null,
      province: null,
      zip_code: null,
      country: null,
      type_of_place: [],
      tags: [],
      raw_metadata: params.metadata,
      uploader_ip: params.uploaderIp,
      uploader_user_agent: params.uploaderUserAgent,
    })
    .select('id, bucket_name, storage_path, image_url, uploader_name, created_at')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}