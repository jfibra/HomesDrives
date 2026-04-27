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

export type AlbumTaxonomyOption = {
  description: string | null
  label: string
  slug: string
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

async function listActiveTaxonomy(tableName: 'albums_place_types' | 'albums_tags') {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from(tableName)
    .select('slug, label, description')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as AlbumTaxonomyOption[]
}

export async function listAllowedPlaceTypes() {
  return listActiveTaxonomy('albums_place_types')
}

export async function listAllowedTags() {
  return listActiveTaxonomy('albums_tags')
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
  albumUserId: number
  bucketName: string
  folderContext?: AlbumFolderContext | null
  imageUrl: string
  metadata: UploadedImageMetadata
  storagePath: string
  uploaderCode: string
  uploaderName: string
  uploaderIp: string | null
  uploaderUserAgent: string | null
}) {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('albums_photos')
    .insert({
      album_user_id: params.albumUserId,
      uploader_code: params.uploaderCode,
      uploader_name: params.uploaderName,
      folder_id: params.folderContext?.id ?? null,
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
      longitude: params.folderContext?.longitude ?? params.metadata.longitude,
      latitude: params.folderContext?.latitude ?? params.metadata.latitude,
      place_name: params.folderContext?.folder_name ?? null,
      full_address: params.folderContext?.full_address ?? null,
      street: params.folderContext?.street ?? null,
      city: params.folderContext?.city ?? null,
      province: params.folderContext?.province ?? null,
      zip_code: params.folderContext?.zip_code ?? null,
      country: params.folderContext?.country ?? null,
      type_of_place: params.folderContext?.type_of_place ?? [],
      tags: params.folderContext?.tags ?? [],
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

export async function updateAlbumPhotoTags(params: {
  city: string | null
  country: string | null
  id: string
  fullAddress: string | null
  latitude: number | null
  longitude: number | null
  placeName: string
  province: string | null
  street: string | null
  tags: string[]
  typeOfPlace: string[]
  zipCode: string | null
}) {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('albums_photos')
    .update({
      city: params.city,
      country: params.country,
      full_address: params.fullAddress,
      latitude: params.latitude,
      longitude: params.longitude,
      place_name: params.placeName,
      province: params.province,
      street: params.street,
      tags: params.tags,
      type_of_place: params.typeOfPlace,
      zip_code: params.zipCode,
    })
    .eq('id', params.id)
    .select('id, place_name, full_address, street, city, province, zip_code, country, latitude, longitude, type_of_place, tags')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export type AlbumUser = {
  id: number
  first_name: string
  last_name: string
  full_name: string
  status: string
  area_focused: string
  email: string
  code: string
}

export type AlbumFolderContext = {
  id: string
  album_user_id: number
  uploader_code: string
  uploader_name: string
  folder_name: string
  full_address: string | null
  street: string | null
  city: string | null
  province: string | null
  zip_code: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  type_of_place: string[]
  tags: string[]
}

export async function listAlbumFoldersByUploader(params: {
  uploaderCode?: string
  uploaderName: string
}) {
  const supabaseAdmin = createSupabaseAdminClient()
  let query = supabaseAdmin
    .from('albums_folders')
    .select('id, album_user_id, uploader_code, uploader_name, folder_name, full_address, street, city, province, zip_code, country, latitude, longitude, type_of_place, tags, created_at')
    .order('created_at', { ascending: false })

  if (params.uploaderCode) {
    query = query.eq('uploader_code', params.uploaderCode)
  } else {
    query = query.eq('uploader_name', params.uploaderName)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return data ?? []
}

export async function createAlbumFolder(params: {
  albumUserId: number
  uploaderName: string
  uploaderCode: string
  folderName: string
  fullAddress: string | null
  street: string | null
  city: string | null
  province: string | null
  zipCode: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  typeOfPlace: string[]
  tags: string[]
}) {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('albums_folders')
    .insert({
      album_user_id: params.albumUserId,
      uploader_code: params.uploaderCode,
      uploader_name: params.uploaderName,
      folder_name: params.folderName,
      full_address: params.fullAddress,
      street: params.street,
      city: params.city,
      province: params.province,
      zip_code: params.zipCode,
      country: params.country,
      latitude: params.latitude,
      longitude: params.longitude,
      type_of_place: params.typeOfPlace,
      tags: params.tags,
    })
    .select('id, album_user_id, uploader_code, uploader_name, folder_name, full_address, street, city, province, zip_code, country, latitude, longitude, type_of_place, tags, created_at')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function getAlbumFolderContext(params: {
  folderId: string
  uploaderCode?: string
  uploaderName: string
}) {
  const supabaseAdmin = createSupabaseAdminClient()
  let query = supabaseAdmin
    .from('albums_folders')
    .select('id, album_user_id, uploader_code, uploader_name, folder_name, full_address, street, city, province, zip_code, country, latitude, longitude, type_of_place, tags')
    .eq('id', params.folderId)

  if (params.uploaderCode) {
    query = query.eq('uploader_code', params.uploaderCode)
  } else {
    query = query.eq('uploader_name', params.uploaderName)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data as AlbumFolderContext | null
}

export async function getUserByCode(code: string): Promise<AlbumUser | null> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('album_users')
    .select('id, first_name, last_name, full_name, status, area_focused, email, code')
    .eq('code', code)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function listPhotosByUploader(params: {
  uploaderCode?: string
  uploaderName: string
}) {
  const supabaseAdmin = createSupabaseAdminClient()
  let query = supabaseAdmin
    .from('albums_photos')
    .select('id, album_user_id, uploader_code, folder_id, image_url, original_file_name, file_size_bytes, created_at, capture_date, device_make, device_model, place_name, city, province, type_of_place, tags, latitude, longitude')
    .order('created_at', { ascending: false })
    .limit(200)

  if (params.uploaderCode) {
    query = query.eq('uploader_code', params.uploaderCode)
  } else {
    query = query.eq('uploader_name', params.uploaderName)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return data ?? []
}