import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'

export type UploadedImageMetadata = {
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

export function buildAvatarStoragePath(userCode: string, uploadedAt: Date) {
  const prefix = getStoragePrefix()
  const safeCode = sanitizePathSegment(userCode) || 'user'
  const year = String(uploadedAt.getFullYear())
  const month = String(uploadedAt.getMonth() + 1).padStart(2, '0')
  const day = String(uploadedAt.getDate()).padStart(2, '0')
  const uniquePrefix = crypto.randomUUID().slice(0, 8)

  return `${prefix}/albums/avatars/${safeCode}/${year}/${month}/${day}/${uniquePrefix}.jpg`
}

export async function uploadAvatarObject(params: { fileBuffer: Buffer; userCode: string }) {
  const uploadedAt = new Date()
  const bucketName = getBucketEnv()

  if (!bucketName) {
    throw new Error('Missing required environment variable: AWS_S3_BUCKET or AWS_S3_BUCKET_NAME')
  }

  const storagePath = buildAvatarStoragePath(params.userCode, uploadedAt)
  const storageClient = createStorageClient()

  await storageClient.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: storagePath,
      Body: params.fileBuffer,
      ContentType: 'image/jpeg',
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

export type AlbumUserRole = 'admin' | 'media' | 'customer'

export const ALBUM_USER_ROLES: readonly AlbumUserRole[] = [
  'admin',
  'media',
  'customer',
] as const

export function isAlbumUserRole(value: unknown): value is AlbumUserRole {
  return typeof value === 'string' && (ALBUM_USER_ROLES as readonly string[]).includes(value)
}

export type AlbumUser = {
  id: number
  first_name: string
  last_name: string
  full_name: string
  status: string
  area_focused: string
  email: string
  phone_number: string
  code: string
  role: AlbumUserRole
  avatar_url?: string | null
  created_at?: string
  updated_at?: string
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
    .select('id, album_user_id, uploader_code, uploader_name, folder_name, full_address, street, city, province, zip_code, country, latitude, longitude, type_of_place, tags, created_at, notes, status')
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
    .select('id, album_user_id, uploader_code, uploader_name, folder_name, full_address, street, city, province, zip_code, country, latitude, longitude, type_of_place, tags, created_at, notes, status')
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
    .select(
      'id, first_name, last_name, full_name, status, area_focused, email, phone_number, code, role, avatar_url',
    )
    .eq('code', code)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as AlbumUser | null) ?? null
}

export async function getUserByEmail(email: string): Promise<AlbumUser | null> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('album_users')
    .select(
      'id, first_name, last_name, full_name, status, area_focused, email, phone_number, code, role, avatar_url',
    )
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as AlbumUser | null) ?? null
}

// ─── Public signup (Customer Drive) ───────────────────────────────────────────

export async function signUpCustomerUser(params: {
  firstName: string
  lastName: string
  email: string
  phoneNumber: string
  areaFocused: string
  password: string
}): Promise<AlbumUser> {
  const supabaseAdmin = createSupabaseAdminClient()
  const fullName = `${params.firstName.trim()} ${params.lastName.trim()}`.trim()
  const code = generateUserCode(params.firstName, params.lastName)
  const email = params.email.trim().toLowerCase()

  // Refuse early if there's already an album_users row with this email
  const existing = await getUserByEmail(email)
  if (existing) {
    throw new Error('An account with this email already exists. Try signing in.')
  }

  // 1. Create Supabase Auth user (auto-confirmed)
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: params.password,
    email_confirm: true,
    user_metadata: { full_name: fullName, code, role: 'customer' },
  })
  if (authErr) {
    if (/already (registered|exists)/i.test(authErr.message)) {
      throw new Error('An account with this email already exists. Try signing in.')
    }
    throw new Error(`Auth: ${authErr.message}`)
  }

  // 2. Insert the album_users row
  const { data, error } = await supabaseAdmin
    .from('album_users')
    .insert({
      first_name: params.firstName.trim(),
      last_name: params.lastName.trim(),
      full_name: fullName,
      status: 'active',
      area_focused: params.areaFocused.trim() || 'Not specified',
      email,
      phone_number: params.phoneNumber.trim(),
      code,
      role: 'customer',
    })
    .select(
      'id, first_name, last_name, full_name, status, area_focused, email, phone_number, code, role',
    )
    .single()

  if (error) {
    // Roll back the auth user if the DB insert failed
    if (authData?.user?.id) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => undefined)
    }
    throw new Error(error.message)
  }

  return data as AlbumUser
}

// ─── Admin helpers ────────────────────────────────────────────────────────────

export async function requireAdminByCode(code: string): Promise<AlbumUser> {
  const user = await getUserByCode(code)
  if (!user) throw new Error('Admin code not found.')
  if (user.role !== 'admin') throw new Error('Forbidden: admin access required.')
  if (user.status !== 'active') throw new Error('Admin account is not active.')
  return user
}

export type AdminUserRow = {
  id: number
  first_name: string
  last_name: string
  full_name: string
  status: string
  area_focused: string
  email: string
  phone_number: string
  code: string
  role: AlbumUserRole
  created_at: string
  updated_at: string
  photo_count?: number
  folder_count?: number
}

export async function listAllAlbumUsers(): Promise<AdminUserRow[]> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('album_users')
    .select(
      'id, first_name, last_name, full_name, status, area_focused, email, phone_number, code, role, created_at, updated_at',
    )
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  const users = (data ?? []) as AdminUserRow[]
  if (users.length === 0) return users

  // Augment with per-user photo + folder counts
  const codes = users.map((u) => u.code)
  const [{ data: folderRows, error: fErr }, { data: photoRows, error: pErr }] = await Promise.all([
    supabaseAdmin.from('albums_folders').select('uploader_code').in('uploader_code', codes),
    supabaseAdmin.from('albums_photos').select('uploader_code').in('uploader_code', codes),
  ])
  if (fErr) throw new Error(fErr.message)
  if (pErr) throw new Error(pErr.message)

  const folderCount = new Map<string, number>()
  for (const r of folderRows ?? []) {
    if (!r.uploader_code) continue
    folderCount.set(r.uploader_code, (folderCount.get(r.uploader_code) ?? 0) + 1)
  }
  const photoCount = new Map<string, number>()
  for (const r of photoRows ?? []) {
    if (!r.uploader_code) continue
    photoCount.set(r.uploader_code, (photoCount.get(r.uploader_code) ?? 0) + 1)
  }

  return users.map((u) => ({
    ...u,
    folder_count: folderCount.get(u.code) ?? 0,
    photo_count: photoCount.get(u.code) ?? 0,
  }))
}

function generateUserCode(firstName: string, lastName: string) {
  const sanitize = (v: string) =>
    v
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9]+/g, '')
      .toUpperCase()
      .slice(0, 12) || 'USER'
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase()
  return `ALB-${sanitize(firstName)}-${sanitize(lastName)}-${random}`
}

export async function createAdminAlbumUser(params: {
  firstName: string
  lastName: string
  email: string
  phoneNumber: string
  areaFocused: string
  password: string
  role: AlbumUserRole
  status: 'active' | 'inactive' | 'suspended'
}) {
  const supabaseAdmin = createSupabaseAdminClient()
  const fullName = `${params.firstName.trim()} ${params.lastName.trim()}`.trim()
  const code = generateUserCode(params.firstName, params.lastName)

  // 1. Create the Supabase Auth user (so they can log in with email + password)
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
    user_metadata: { full_name: fullName, code },
  })
  if (authErr) throw new Error(`Auth: ${authErr.message}`)

  // 2. Insert the album_users row
  const { data, error } = await supabaseAdmin
    .from('album_users')
    .insert({
      first_name: params.firstName.trim(),
      last_name: params.lastName.trim(),
      full_name: fullName,
      status: params.status,
      area_focused: params.areaFocused.trim(),
      email: params.email.trim().toLowerCase(),
      phone_number: params.phoneNumber.trim(),
      code,
      role: params.role,
    })
    .select(
      'id, first_name, last_name, full_name, status, area_focused, email, phone_number, code, role, created_at, updated_at',
    )
    .single()

  if (error) {
    // Roll back the auth user if the DB insert failed
    if (authData?.user?.id) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => undefined)
    }
    throw new Error(error.message)
  }

  return data as AdminUserRow
}

/** Media & customer: update own profile (names, phone, area). Keeps folders/photos uploader_name in sync. */
export async function updateAlbumUserOwnProfile(params: {
  code: string
  firstName?: string
  lastName?: string
  phoneNumber?: string
  areaFocused?: string
}): Promise<AlbumUser> {
  const code = params.code.trim()
  const user = await getUserByCode(code)
  if (!user) throw new Error('User not found.')
  if (user.status !== 'active') throw new Error('Account is not active.')
  if (user.role !== 'media' && user.role !== 'customer') {
    throw new Error('Only media and customer accounts can update their profile here.')
  }

  const fn = params.firstName !== undefined ? params.firstName.trim() : user.first_name
  const ln = params.lastName !== undefined ? params.lastName.trim() : user.last_name
  if (!fn || !ln) throw new Error('First and last name are required.')

  const phone = params.phoneNumber !== undefined ? params.phoneNumber.trim() : user.phone_number
  const area = params.areaFocused !== undefined ? params.areaFocused.trim() : user.area_focused
  if (!phone) throw new Error('Phone number is required.')
  if (!area) throw new Error('Area focused is required.')

  const fullName = `${fn} ${ln}`.trim()

  const supabaseAdmin = createSupabaseAdminClient()

  const { data: updated, error } = await supabaseAdmin
    .from('album_users')
    .update({
      first_name: fn,
      last_name: ln,
      full_name: fullName,
      phone_number: phone,
      area_focused: area,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)
    .eq('code', code)
    .select(
      'id, first_name, last_name, full_name, status, area_focused, email, phone_number, code, role, avatar_url',
    )
    .single()

  if (error) throw new Error(error.message)

  await supabaseAdmin.from('albums_folders').update({ uploader_name: fullName }).eq('album_user_id', user.id)
  await supabaseAdmin.from('albums_photos').update({ uploader_name: fullName }).eq('album_user_id', user.id)

  return updated as AlbumUser
}

export async function setAlbumUserAvatarUrl(params: { userId: number; code: string; avatarUrl: string }) {
  const supabaseAdmin = createSupabaseAdminClient()
  const { error } = await supabaseAdmin
    .from('album_users')
    .update({
      avatar_url: params.avatarUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.userId)
    .eq('code', params.code.trim())

  if (error) throw new Error(error.message)
}

export async function updateAdminAlbumUser(params: {
  id: number
  firstName?: string
  lastName?: string
  email?: string
  phoneNumber?: string
  areaFocused?: string
  password?: string
  role?: AlbumUserRole
  status?: 'active' | 'inactive' | 'suspended'
}) {
  const supabaseAdmin = createSupabaseAdminClient()

  // Fetch current row (needed to find the auth user by email)
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('album_users')
    .select('id, email, first_name, last_name')
    .eq('id', params.id)
    .maybeSingle()
  if (existingErr) throw new Error(existingErr.message)
  if (!existing) throw new Error('User not found.')

  // Find the matching Supabase Auth user
  let authUserId: string | null = null
  try {
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const match = list?.users?.find(
      (u) => u.email?.toLowerCase() === String(existing.email).toLowerCase(),
    )
    authUserId = match?.id ?? null
  } catch {
    authUserId = null
  }

  // Update auth (password / email) if needed
  if (authUserId && (params.email || params.password)) {
    const authUpdate: Record<string, unknown> = {}
    if (params.email) authUpdate.email = params.email.trim().toLowerCase()
    if (params.password) authUpdate.password = params.password
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(authUserId, authUpdate)
    if (authErr) throw new Error(`Auth: ${authErr.message}`)
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (params.firstName !== undefined) updates.first_name = params.firstName.trim()
  if (params.lastName !== undefined) updates.last_name = params.lastName.trim()
  if (params.firstName !== undefined || params.lastName !== undefined) {
    const fn = (params.firstName ?? existing.first_name).trim()
    const ln = (params.lastName ?? existing.last_name).trim()
    updates.full_name = `${fn} ${ln}`.trim()
  }
  if (params.email !== undefined) updates.email = params.email.trim().toLowerCase()
  if (params.phoneNumber !== undefined) updates.phone_number = params.phoneNumber.trim()
  if (params.areaFocused !== undefined) updates.area_focused = params.areaFocused.trim()
  if (params.role !== undefined) updates.role = params.role
  if (params.status !== undefined) updates.status = params.status

  const { data, error } = await supabaseAdmin
    .from('album_users')
    .update(updates)
    .eq('id', params.id)
    .select(
      'id, first_name, last_name, full_name, status, area_focused, email, phone_number, code, role, created_at, updated_at',
    )
    .single()

  if (error) throw new Error(error.message)
  return data as AdminUserRow
}

// ─── Admin browse: a user's folders + a folder's photos ──────────────────────

export type AdminUserFolder = {
  id: string
  uploader_code: string | null
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
  notes: string | null
  status: string
  created_at: string
  updated_at: string
  photo_count: number
  cover_image_url: string | null
}

export async function listFoldersByUserId(userId: number): Promise<AdminUserFolder[]> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data: folders, error } = await supabaseAdmin
    .from('albums_folders')
    .select(
      'id, uploader_code, uploader_name, folder_name, full_address, street, city, province, zip_code, country, latitude, longitude, type_of_place, tags, notes, status, created_at, updated_at',
    )
    .eq('album_user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  const list = (folders ?? []) as Omit<AdminUserFolder, 'photo_count' | 'cover_image_url'>[]
  if (list.length === 0) return []

  const ids = list.map((f) => f.id)

  const { data: photos, error: photosErr } = await supabaseAdmin
    .from('albums_photos')
    .select('id, folder_id, image_url, created_at')
    .in('folder_id', ids)
    .order('created_at', { ascending: false })

  if (photosErr) throw new Error(photosErr.message)

  const countByFolder = new Map<string, number>()
  const coverByFolder = new Map<string, string>()
  for (const p of photos ?? []) {
    if (!p.folder_id) continue
    countByFolder.set(p.folder_id, (countByFolder.get(p.folder_id) ?? 0) + 1)
    if (!coverByFolder.has(p.folder_id) && p.image_url) {
      coverByFolder.set(p.folder_id, p.image_url)
    }
  }

  return list.map((f) => ({
    ...f,
    photo_count: countByFolder.get(f.id) ?? 0,
    cover_image_url: coverByFolder.get(f.id) ?? null,
  }))
}

export type AdminFolderPhoto = {
  id: string
  image_url: string
  original_file_name: string
  file_size_bytes: number
  capture_date: string | null
  created_at: string
  device_make: string | null
  device_model: string | null
  width: number | null
  height: number | null
  place_name: string | null
  city: string | null
  province: string | null
  type_of_place: string[]
  tags: string[]
}

export async function listPhotosByFolderId(folderId: string): Promise<AdminFolderPhoto[]> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('albums_photos')
    .select(
      'id, image_url, original_file_name, file_size_bytes, capture_date, created_at, device_make, device_model, width, height, place_name, city, province, type_of_place, tags',
    )
    .eq('folder_id', folderId)
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) throw new Error(error.message)
  return (data ?? []) as AdminFolderPhoto[]
}

/** UTC calendar day (YYYY-MM-DD), matching admin stats heatmap buckets. */
export async function listPhotosByUploaderUtcDay(params: {
  uploaderCode: string
  day: string
}): Promise<AdminFolderPhoto[]> {
  const { uploaderCode, day } = params
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error('Invalid day.')
  }
  const start = `${day}T00:00:00.000Z`
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 1)
  const endExclusive = end.toISOString()

  const supabaseAdmin = createSupabaseAdminClient()
  let query = supabaseAdmin
    .from('albums_photos')
    .select(
      'id, image_url, original_file_name, file_size_bytes, capture_date, created_at, device_make, device_model, width, height, place_name, city, province, type_of_place, tags',
    )
    .gte('created_at', start)
    .lt('created_at', endExclusive)
    .order('created_at', { ascending: false })
    .limit(2000)

  // Same sentinel as getAdminStats per-user key when uploader_code is null
  if (uploaderCode === '—') {
    query = query.is('uploader_code', null)
  } else {
    query = query.eq('uploader_code', uploaderCode)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as AdminFolderPhoto[]
}

export async function deleteAdminAlbumUser(params: { id: number }) {
  const supabaseAdmin = createSupabaseAdminClient()

  const { data: existing, error: exErr } = await supabaseAdmin
    .from('album_users')
    .select('id, email, role')
    .eq('id', params.id)
    .maybeSingle()
  if (exErr) throw new Error(exErr.message)
  if (!existing) throw new Error('User not found.')
  if (existing.role === 'admin') {
    throw new Error('Refusing to delete an admin account from the admin UI.')
  }

  // Delete from Supabase Auth (best-effort)
  try {
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const match = list?.users?.find(
      (u) => u.email?.toLowerCase() === String(existing.email).toLowerCase(),
    )
    if (match?.id) {
      await supabaseAdmin.auth.admin.deleteUser(match.id).catch(() => undefined)
    }
  } catch {
    /* ignore */
  }

  const { error } = await supabaseAdmin.from('album_users').delete().eq('id', params.id)
  if (error) throw new Error(error.message)
}

export type AdminStats = {
  totals: {
    users: number
    activeUsers: number
    inactiveUsers: number
    suspendedUsers: number
    folders: number
    activeFolders: number
    archivedFolders: number
    photos: number
    totalStorageBytes: number
  }
  topUploaders: { code: string; name: string; photos: number }[]
  recentUploads: {
    id: string
    image_url: string
    original_file_name: string
    uploader_name: string
    uploader_code: string | null
    created_at: string
    place_name: string | null
  }[]
  uploadsByDay: { day: string; count: number }[]
  uploadsByUserByDay: {
    code: string
    name: string
    total: number
    today: number
    days: { day: string; count: number }[]
  }[]
}

export async function getAdminStats(): Promise<AdminStats> {
  const supabaseAdmin = createSupabaseAdminClient()

  // 14-day window for the chart (start of UTC day, 13 days ago → now)
  const now = new Date()
  const windowStart = new Date(now)
  windowStart.setUTCHours(0, 0, 0, 0)
  windowStart.setUTCDate(windowStart.getUTCDate() - 13)
  const windowStartIso = windowStart.toISOString()

  const [
    usersRes,
    foldersRes,
    photosCountRes,
    photoSizeSumRes,
    topUploadersRes,
    recentRes,
    chartRes,
  ] = await Promise.all([
    // Users
    supabaseAdmin.from('album_users').select('status, role'),
    // Folders
    supabaseAdmin.from('albums_folders').select('status'),
    // Total photo count (head:true → count only, no row scan)
    supabaseAdmin.from('albums_photos').select('id', { count: 'exact', head: true }),
    // Total storage bytes — fetch only the size column, paginated isn't needed for sum
    // but we still cap at 10k for safety. Adjust if you grow beyond that.
    supabaseAdmin.from('albums_photos').select('file_size_bytes').limit(10000),
    // Top uploaders — group server-side via a wide select, capped at 10k rows
    supabaseAdmin
      .from('albums_photos')
      .select('uploader_code, uploader_name')
      .limit(10000),
    // Recent uploads
    supabaseAdmin
      .from('albums_photos')
      .select('id, image_url, original_file_name, uploader_name, uploader_code, created_at, place_name')
      .order('created_at', { ascending: false })
      .limit(10),
    // 14-day chart — explicit date filter, no row cap risk.
    // Includes uploader info so we can also build the per-user breakdown.
    supabaseAdmin
      .from('albums_photos')
      .select('created_at, uploader_code, uploader_name')
      .gte('created_at', windowStartIso)
      .order('created_at', { ascending: true })
      .limit(50000),
  ])

  if (usersRes.error) throw new Error(usersRes.error.message)
  if (foldersRes.error) throw new Error(foldersRes.error.message)
  if (photosCountRes.error) throw new Error(photosCountRes.error.message)
  if (photoSizeSumRes.error) throw new Error(photoSizeSumRes.error.message)
  if (topUploadersRes.error) throw new Error(topUploadersRes.error.message)
  if (recentRes.error) throw new Error(recentRes.error.message)
  if (chartRes.error) throw new Error(chartRes.error.message)

  const userRows = usersRes.data ?? []
  const folderRows = foldersRes.data ?? []
  const photoSizeRows = photoSizeSumRes.data ?? []
  const topUploaderRows = topUploadersRes.data ?? []
  const chartRows = chartRes.data ?? []

  const totals = {
    users: userRows.length,
    activeUsers: userRows.filter((u) => u.status === 'active').length,
    inactiveUsers: userRows.filter((u) => u.status === 'inactive').length,
    suspendedUsers: userRows.filter((u) => u.status === 'suspended').length,
    folders: folderRows.length,
    activeFolders: folderRows.filter((f) => (f.status ?? 'active') !== 'archived').length,
    archivedFolders: folderRows.filter((f) => f.status === 'archived').length,
    photos: photosCountRes.count ?? 0,
    totalStorageBytes: photoSizeRows.reduce(
      (sum: number, r: { file_size_bytes: number | null }) => sum + (r.file_size_bytes ?? 0),
      0,
    ),
  }

  // Top uploaders by photo count
  const byUploader = new Map<string, { code: string; name: string; photos: number }>()
  for (const row of topUploaderRows as {
    uploader_code: string | null
    uploader_name: string | null
  }[]) {
    const code = row.uploader_code ?? '—'
    const existing = byUploader.get(code)
    if (existing) {
      existing.photos += 1
    } else {
      byUploader.set(code, { code, name: row.uploader_name ?? 'Unknown', photos: 1 })
    }
  }
  const topUploaders = Array.from(byUploader.values())
    .sort((a, b) => b.photos - a.photos)
    .slice(0, 5)

  // Uploads per day (last 14 days, UTC day buckets) — aggregate window
  const dayKeys: string[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - i)
    dayKeys.push(d.toISOString().slice(0, 10))
  }
  const todayKey = dayKeys[dayKeys.length - 1]

  const byDay = new Map<string, number>(dayKeys.map((k) => [k, 0]))

  // Per-user-per-day map: uploaderCode → { name, days: Map<day,count> }
  const perUserByDay = new Map<
    string,
    { code: string; name: string; days: Map<string, number> }
  >()

  for (const row of chartRows as {
    created_at: string
    uploader_code: string | null
    uploader_name: string | null
  }[]) {
    const day = row.created_at?.slice(0, 10)
    if (!day || !byDay.has(day)) continue

    byDay.set(day, (byDay.get(day) ?? 0) + 1)

    const code = row.uploader_code ?? '—'
    let entry = perUserByDay.get(code)
    if (!entry) {
      entry = {
        code,
        name: row.uploader_name ?? 'Unknown',
        days: new Map(dayKeys.map((k) => [k, 0])),
      }
      perUserByDay.set(code, entry)
    }
    entry.days.set(day, (entry.days.get(day) ?? 0) + 1)
  }

  const uploadsByDay = dayKeys.map((day) => ({ day, count: byDay.get(day) ?? 0 }))

  const uploadsByUserByDay = Array.from(perUserByDay.values())
    .map((entry) => {
      const days = dayKeys.map((day) => ({ day, count: entry.days.get(day) ?? 0 }))
      const total = days.reduce((s, d) => s + d.count, 0)
      const today = entry.days.get(todayKey) ?? 0
      return { code: entry.code, name: entry.name, total, today, days }
    })
    .sort((a, b) => b.total - a.total)

  return {
    totals,
    topUploaders,
    recentUploads: (recentRes.data ?? []) as AdminStats['recentUploads'],
    uploadsByDay,
    uploadsByUserByDay,
  }
}

export async function listPhotosByUploader(params: {
  uploaderCode?: string
  uploaderName: string
}) {
  const supabaseAdmin = createSupabaseAdminClient()
  // Dashboard needs all of a user's photos for per-folder views and counts.
  // Keep a high cap so Supabase/PostgREST stays bounded (adjust if you shard by user).
  const maxRows = 50_000

  let query = supabaseAdmin
    .from('albums_photos')
    .select('id, album_user_id, uploader_code, folder_id, image_url, original_file_name, file_size_bytes, created_at, capture_date, device_make, device_model, place_name, city, province, type_of_place, tags, latitude, longitude')
    .order('created_at', { ascending: false })
    .limit(maxRows)

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

export type AlbumsMarketplaceSort = 'newest' | 'oldest' | 'captured'

export type AlbumsMarketplacePhoto = {
  id: string
  image_url: string
  original_file_name: string
  uploader_name: string
  uploader_code: string | null
  created_at: string
  capture_date: string | null
  place_name: string | null
  city: string | null
  province: string | null
  country: string | null
  type_of_place: string[]
  tags: string[]
  width: number | null
  height: number | null
}

export async function listMarketplacePhotos(params: {
  page: number
  pageSize: number
  placeType?: string
  query?: string
  sort?: AlbumsMarketplaceSort
  tag?: string
}) {
  const page = Math.max(1, Math.floor(params.page))
  const pageSize = Math.min(60, Math.max(1, Math.floor(params.pageSize)))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const term = params.query?.trim().replace(/[%_]/g, '')
  const placeType = params.placeType?.trim()
  const tag = params.tag?.trim()
  const sort: AlbumsMarketplaceSort = params.sort ?? 'newest'

  const supabaseAdmin = createSupabaseAdminClient()

  let countQuery = supabaseAdmin
    .from('albums_photos')
    .select('id', { count: 'exact', head: true })

  let photosQuery = supabaseAdmin
    .from('albums_photos')
    .select('id, image_url, original_file_name, uploader_name, uploader_code, created_at, capture_date, place_name, city, province, country, type_of_place, tags, width, height')
    .range(from, to)

  if (term) {
    const fields = [
      `uploader_name.ilike.%${term}%`,
      `original_file_name.ilike.%${term}%`,
      `place_name.ilike.%${term}%`,
      `city.ilike.%${term}%`,
      `province.ilike.%${term}%`,
      `country.ilike.%${term}%`,
    ]
    const clause = fields.join(',')
    countQuery = countQuery.or(clause)
    photosQuery = photosQuery.or(clause)
  }

  if (placeType) {
    countQuery = countQuery.contains('type_of_place', [placeType])
    photosQuery = photosQuery.contains('type_of_place', [placeType])
  }

  if (tag) {
    countQuery = countQuery.contains('tags', [tag])
    photosQuery = photosQuery.contains('tags', [tag])
  }

  if (sort === 'oldest') {
    photosQuery = photosQuery.order('created_at', { ascending: true })
  } else if (sort === 'captured') {
    photosQuery = photosQuery.order('capture_date', { ascending: false, nullsFirst: false })
  } else {
    photosQuery = photosQuery.order('created_at', { ascending: false })
  }

  const [{ count, error: countError }, { data, error: dataError }] = await Promise.all([
    countQuery,
    photosQuery,
  ])

  if (countError) {
    throw new Error(countError.message)
  }

  if (dataError) {
    throw new Error(dataError.message)
  }

  return {
    photos: (data ?? []) as AlbumsMarketplacePhoto[],
    totalCount: count ?? 0,
  }
}

// ─── Folder management ────────────────────────────────────────────────────────

export async function updateAlbumFolder(params: {
  id: string
  uploaderCode: string
  folderName?: string
  fullAddress?: string | null
  street?: string | null
  city?: string | null
  province?: string | null
  zipCode?: string | null
  country?: string | null
  latitude?: number | null
  longitude?: number | null
  typeOfPlace?: string[]
  tags?: string[]
  notes?: string | null
  status?: 'active' | 'archived'
}) {
  const supabaseAdmin = createSupabaseAdminClient()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (params.folderName !== undefined) updates.folder_name = params.folderName
  if (params.fullAddress !== undefined) updates.full_address = params.fullAddress
  if (params.street !== undefined) updates.street = params.street
  if (params.city !== undefined) updates.city = params.city
  if (params.province !== undefined) updates.province = params.province
  if (params.zipCode !== undefined) updates.zip_code = params.zipCode
  if (params.country !== undefined) updates.country = params.country
  if (params.latitude !== undefined) updates.latitude = params.latitude
  if (params.longitude !== undefined) updates.longitude = params.longitude
  if (params.typeOfPlace !== undefined) updates.type_of_place = params.typeOfPlace
  if (params.tags !== undefined) updates.tags = params.tags
  if (params.notes !== undefined) updates.notes = params.notes
  if (params.status !== undefined) updates.status = params.status

  const { data, error } = await supabaseAdmin
    .from('albums_folders')
    .update(updates)
    .eq('id', params.id)
    .eq('uploader_code', params.uploaderCode)
    .select('id, album_user_id, uploader_code, uploader_name, folder_name, full_address, street, city, province, zip_code, country, latitude, longitude, type_of_place, tags, created_at, notes, status')
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function deleteAlbumFolder(params: {
  id: string
  uploaderCode: string
  withPhotos: boolean
}) {
  const supabaseAdmin = createSupabaseAdminClient()

  if (params.withPhotos) {
    const { data: photos } = await supabaseAdmin
      .from('albums_photos')
      .select('id, bucket_name, storage_path')
      .eq('folder_id', params.id)
      .eq('uploader_code', params.uploaderCode)

    if (photos && photos.length > 0) {
      await Promise.allSettled(
        photos.map((p) => deleteImageObject(p.bucket_name, p.storage_path)),
      )
      await supabaseAdmin
        .from('albums_photos')
        .delete()
        .eq('folder_id', params.id)
        .eq('uploader_code', params.uploaderCode)
    }
  } else {
    await supabaseAdmin
      .from('albums_photos')
      .update({ folder_id: null })
      .eq('folder_id', params.id)
      .eq('uploader_code', params.uploaderCode)
  }

  const { error } = await supabaseAdmin
    .from('albums_folders')
    .delete()
    .eq('id', params.id)
    .eq('uploader_code', params.uploaderCode)

  if (error) throw new Error(error.message)
}

export async function movePhotoToFolder(params: {
  photoId: string
  targetFolderId: string | null
  uploaderCode: string
}) {
  const supabaseAdmin = createSupabaseAdminClient()

  let folderCtx: AlbumFolderContext | null = null
  if (params.targetFolderId) {
    folderCtx = await getAlbumFolderContext({
      folderId: params.targetFolderId,
      uploaderCode: params.uploaderCode,
      uploaderName: '',
    })
    if (!folderCtx) throw new Error('Target folder not found.')
  }

  const update: Record<string, unknown> = { folder_id: params.targetFolderId }

  if (folderCtx) {
    update.place_name = folderCtx.folder_name
    update.full_address = folderCtx.full_address
    update.street = folderCtx.street
    update.city = folderCtx.city
    update.province = folderCtx.province
    update.zip_code = folderCtx.zip_code
    update.country = folderCtx.country
    update.latitude = folderCtx.latitude
    update.longitude = folderCtx.longitude
    update.type_of_place = folderCtx.type_of_place
    update.tags = folderCtx.tags
  }

  const { data, error } = await supabaseAdmin
    .from('albums_photos')
    .update(update)
    .eq('id', params.photoId)
    .eq('uploader_code', params.uploaderCode)
    .select('id, folder_id')
    .single()

  if (error) throw new Error(error.message)
  return data
}