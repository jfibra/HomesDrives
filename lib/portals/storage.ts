import {
  buildPublicImageUrl,
  assertStoredObjectByteLength,
  completeMultipartUploadObject,
  createPresignedMultipartUpload,
  createPresignedUploadObject,
  createSupabaseAdminClient,
  createStorageClient,
  deleteImageObject,
  getUserByCode,
  requireAdminByCode,
  uploadOriginalMediaObject,
} from '@/lib/server/albums'
import {
  DEFAULT_PRESIGN_EXPIRY_SECONDS,
  MAX_PHOTO_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  MULTIPART_PART_SIZE_BYTES,
  MULTIPART_VIDEO_THRESHOLD_BYTES,
  VIDEO_PRESIGN_EXPIRY_SECONDS,
} from '@/lib/photo-upload-limits'
import { GetObjectCommand } from '@aws-sdk/client-s3'

import {
  PHOTOGRAPHER_PORTAL_CODE,
  PORTAL_UPLOADER_CODES,
  PUBLIC_PORTAL_CODE,
} from './constants'
import type { PortalFolder, PortalFolderNode, PortalPhoto, PortalPhotoPreview } from './types'
import {
  inferPortalContentType,
  isAllowedPortalUpload,
  isPortalVideoFile,
} from './upload-file-utils'

export async function requirePortalAdmin(adminCode: string) {
  return requireAdminByCode(adminCode)
}

export async function getPortalUser(code: string) {
  const user = await getUserByCode(code)
  if (!user || user.status !== 'active') {
    throw new Error('Portal account is not available.')
  }
  return user
}

async function countPhotosByFolderIds(folderIds: string[]) {
  const supabaseAdmin = createSupabaseAdminClient()
  const counts = new Map<string, number>()
  if (folderIds.length === 0) return counts

  const chunkSize = 100
  for (let i = 0; i < folderIds.length; i += chunkSize) {
    const chunk = folderIds.slice(i, i + chunkSize)
    let offset = 0
    for (;;) {
      const { data, error } = await supabaseAdmin
        .from('albums_photos')
        .select('folder_id')
        .in('folder_id', chunk)
        .range(offset, offset + 999)
      if (error) throw new Error(error.message)
      const batch = data ?? []
      for (const row of batch) {
        if (!row.folder_id) continue
        counts.set(row.folder_id, (counts.get(row.folder_id) ?? 0) + 1)
      }
      if (batch.length < 1000) break
      offset += 1000
    }
  }
  return counts
}

export async function listPortalFoldersForAdmin(): Promise<PortalFolder[]> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('albums_folders')
    .select('id, parent_folder_id, uploader_code, uploader_name, folder_name, created_at')
    .in('uploader_code', [...PORTAL_UPLOADER_CODES])
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Omit<PortalFolder, 'photo_count'>[]
  const counts = await countPhotosByFolderIds(rows.map((r) => r.id))
  return rows.map((row) => ({
    ...row,
    parent_folder_id: row.parent_folder_id ?? null,
    photo_count: counts.get(row.id) ?? 0,
  }))
}

export async function listPortalFoldersForUploader(uploaderCode: string): Promise<PortalFolder[]> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('albums_folders')
    .select('id, parent_folder_id, uploader_code, uploader_name, folder_name, created_at')
    .eq('uploader_code', uploaderCode)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Omit<PortalFolder, 'photo_count'>[]
  const counts = await countPhotosByFolderIds(rows.map((r) => r.id))
  return rows.map((row) => ({
    ...row,
    parent_folder_id: row.parent_folder_id ?? null,
    photo_count: counts.get(row.id) ?? 0,
  }))
}

export function buildFolderTree(folders: PortalFolder[]): PortalFolderNode[] {
  const byId = new Map<string, PortalFolderNode>()
  for (const folder of folders) {
    byId.set(folder.id, { ...folder, children: [] })
  }

  const roots: PortalFolderNode[] = []
  for (const node of byId.values()) {
    if (node.parent_folder_id && byId.has(node.parent_folder_id)) {
      byId.get(node.parent_folder_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  // Aggregate photo_count so parent folders show totals of their children.
  // (Leaf folders still show their direct counts.)
  const aggregateCounts = (node: PortalFolderNode): number => {
    let total = node.photo_count ?? 0
    for (const child of node.children) {
      total += aggregateCounts(child)
    }
    node.photo_count = total
    return total
  }

  const sortNodes = (nodes: PortalFolderNode[]) => {
    nodes.sort((a, b) => b.created_at.localeCompare(a.created_at))
    nodes.forEach((n) => sortNodes(n.children))
  }
  sortNodes(roots)

  for (const root of roots) {
    aggregateCounts(root)
  }
  return roots
}

export async function createPortalFolder(params: {
  uploaderCode: string
  folderName: string
  parentFolderId?: string | null
  labelSuffix?: string
}) {
  const user = await getPortalUser(params.uploaderCode)
  const supabaseAdmin = createSupabaseAdminClient()

  if (params.parentFolderId) {
    const { data: parent, error: parentError } = await supabaseAdmin
      .from('albums_folders')
      .select('id, uploader_code, parent_folder_id')
      .eq('id', params.parentFolderId)
      .maybeSingle()
    if (parentError) throw new Error(parentError.message)
    if (!parent || parent.uploader_code !== params.uploaderCode) {
      throw new Error('Parent folder not found.')
    }

    if (params.uploaderCode === PHOTOGRAPHER_PORTAL_CODE && parent.parent_folder_id) {
      throw new Error('Sub-folders cannot be created inside another sub-folder.')
    }
  }

  const folderName = params.labelSuffix
    ? `${params.folderName.trim()} · ${params.labelSuffix.trim()}`
    : params.folderName.trim()

  const { data, error } = await supabaseAdmin
    .from('albums_folders')
    .insert({
      album_user_id: user.id,
      uploader_code: user.code,
      uploader_name: user.full_name,
      folder_name: folderName,
      parent_folder_id: params.parentFolderId ?? null,
      type_of_place: params.uploaderCode === PUBLIC_PORTAL_CODE ? ['Public submission'] : ['Photographer portal'],
      tags:
        params.uploaderCode === PUBLIC_PORTAL_CODE
          ? ['public-upload', 'temp-portal']
          : ['photographer-portal', 'temp-portal'],
    })
    .select('id, parent_folder_id, uploader_code, uploader_name, folder_name, created_at')
    .single()

  if (error) throw new Error(error.message)
  return { ...(data as Omit<PortalFolder, 'photo_count'>), photo_count: 0 }
}

export async function renamePortalFolder(id: string, folderName: string) {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('albums_folders')
    .update({ folder_name: folderName.trim() })
    .eq('id', id)
    .in('uploader_code', [...PORTAL_UPLOADER_CODES])
    .select('id, parent_folder_id, uploader_code, uploader_name, folder_name, created_at')
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Folder not found.')
  return { ...(data as Omit<PortalFolder, 'photo_count'>), photo_count: 0 }
}

export async function deletePortalFolder(id: string) {
  const supabaseAdmin = createSupabaseAdminClient()

  const { data: photos } = await supabaseAdmin
    .from('albums_photos')
    .select('id, bucket_name, storage_path')
    .eq('folder_id', id)

  if (photos?.length) {
    await Promise.allSettled(
      photos.map((p) => deleteImageObject(p.bucket_name, p.storage_path)),
    )
    await supabaseAdmin.from('albums_photos').delete().eq('folder_id', id)
  }

  const { error } = await supabaseAdmin
    .from('albums_folders')
    .delete()
    .eq('id', id)
    .in('uploader_code', [...PORTAL_UPLOADER_CODES])

  if (error) throw new Error(error.message)
}

export async function deletePortalFolderForUploader(folderId: string, uploaderCode: string) {
  await getPortalFolderForUploader(folderId, uploaderCode)

  const allFolders = await listPortalFoldersForUploader(uploaderCode)
  const folderIdsToRemove = new Set<string>()
  const stack = [folderId]

  while (stack.length) {
    const current = stack.pop()!
    folderIdsToRemove.add(current)
    for (const folder of allFolders) {
      if (folder.parent_folder_id === current) {
        stack.push(folder.id)
      }
    }
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const ids = [...folderIdsToRemove]

  for (const id of ids) {
    const { data: photos } = await supabaseAdmin
      .from('albums_photos')
      .select('id, bucket_name, storage_path')
      .eq('folder_id', id)

    if (photos?.length) {
      await Promise.allSettled(
        photos.map((photo) => deleteImageObject(photo.bucket_name, photo.storage_path)),
      )
      await supabaseAdmin.from('albums_photos').delete().eq('folder_id', id)
    }
  }

  const depthById = new Map<string, number>()
  const getDepth = (id: string): number => {
    if (depthById.has(id)) return depthById.get(id)!
    const folder = allFolders.find((entry) => entry.id === id)
    if (!folder?.parent_folder_id || !folderIdsToRemove.has(folder.parent_folder_id)) {
      depthById.set(id, 0)
      return 0
    }
    const depth = getDepth(folder.parent_folder_id) + 1
    depthById.set(id, depth)
    return depth
  }

  const sortedIds = [...ids].sort((a, b) => getDepth(b) - getDepth(a))
  for (const id of sortedIds) {
    const { error } = await supabaseAdmin
      .from('albums_folders')
      .delete()
      .eq('id', id)
      .eq('uploader_code', uploaderCode)

    if (error) throw new Error(error.message)
  }
}

export async function deletePortalPhotoForUploader(photoId: string, uploaderCode: string) {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data: photo, error: selectError } = await supabaseAdmin
    .from('albums_photos')
    .select('id, folder_id, bucket_name, storage_path, uploader_code')
    .eq('id', photoId)
    .maybeSingle()

  if (selectError) throw new Error(selectError.message)
  if (!photo) throw new Error('Photo not found.')
  if (photo.uploader_code !== uploaderCode) throw new Error('Photo not found.')

  if (photo.folder_id) {
    await getPortalFolderForUploader(photo.folder_id, uploaderCode)
  }

  await deleteImageObject(photo.bucket_name, photo.storage_path)
  const { error } = await supabaseAdmin.from('albums_photos').delete().eq('id', photoId)
  if (error) throw new Error(error.message)
}

export async function getPhotographerFolderTreeContext(rootFolderId: string) {
  const allFolders = await listPortalFoldersForUploader(PHOTOGRAPHER_PORTAL_CODE)
  const byId = new Map(allFolders.map((f) => [f.id, f]))
  const root = byId.get(rootFolderId)
  if (!root) return null

  const childrenByParent = new Map<string, string[]>()
  for (const folder of allFolders) {
    if (!folder.parent_folder_id) continue
    if (!childrenByParent.has(folder.parent_folder_id)) {
      childrenByParent.set(folder.parent_folder_id, [])
    }
    childrenByParent.get(folder.parent_folder_id)!.push(folder.id)
  }

  const folderIds: string[] = []
  const stack = [rootFolderId]
  while (stack.length) {
    const current = stack.pop()!
    folderIds.push(current)
    for (const kid of childrenByParent.get(current) ?? []) stack.push(kid)
  }

  return { root, byId, folderIds, childrenByParent }
}

export async function listPortalPhotosForFolderTree(rootFolderId: string): Promise<{
  folder: PortalFolder
  photos: PortalPhotoPreview[]
}> {
  const context = await getPhotographerFolderTreeContext(rootFolderId)
  if (!context) throw new Error('Folder not found.')

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('albums_photos')
    .select('id, folder_id, image_url, original_file_name, file_size_bytes, created_at')
    .in('folder_id', context.folderIds)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)

  const photos = (data ?? []).map((photo) => ({
    ...(photo as PortalPhoto),
    subfolder_name:
      photo.folder_id && photo.folder_id !== rootFolderId
        ? (context.byId.get(photo.folder_id)?.folder_name ?? null)
        : null,
  }))

  return { folder: context.root, photos }
}

export async function listPortalPhotos(folderId: string): Promise<PortalPhoto[]> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('albums_photos')
    .select('id, folder_id, image_url, original_file_name, file_size_bytes, created_at')
    .eq('folder_id', folderId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as PortalPhoto[]
}

type PortalPhotoFile = {
  id: string
  folder_id: string | null
  bucket_name: string
  storage_path: string
  original_file_name: string
  created_at: string
}

export async function listPortalPhotoFilesByFolderIds(folderIds: string[]): Promise<PortalPhotoFile[]> {
  const supabaseAdmin = createSupabaseAdminClient()
  if (folderIds.length === 0) return []

  const { data, error } = await supabaseAdmin
    .from('albums_photos')
    .select('id, folder_id, bucket_name, storage_path, original_file_name, created_at')
    .in('folder_id', folderIds)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as PortalPhotoFile[]
}

export async function downloadPortalPhotoObject(params: {
  bucketName: string
  storagePath: string
}): Promise<Buffer> {
  const storageClient = createStorageClient()
  const res = await storageClient.send(
    new GetObjectCommand({ Bucket: params.bucketName, Key: params.storagePath }),
  )
  const body = res.Body
  if (!body) throw new Error('Unable to download file.')

  // AWS SDK v3 Body can be a stream; transformToByteArray exists in Node 18+.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyBody = body as any
  if (typeof anyBody.transformToByteArray === 'function') {
    const bytes = await anyBody.transformToByteArray()
    return Buffer.from(bytes)
  }

  // Fallback: collect stream chunks.
  const chunks: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = body as any
    stream.on('data', (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    stream.on('end', () => resolve())
    stream.on('error', (err: unknown) => reject(err))
  })
  return Buffer.concat(chunks)
}

export async function getPortalPhotoForPublicDownload(photoId: string) {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('albums_photos')
    .select('id, bucket_name, storage_path, original_file_name, file_type, uploader_code')
    .eq('id', photoId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Photo not found.')

  const uploaderCode = String(data.uploader_code ?? '')
  if (!PORTAL_UPLOADER_CODES.includes(uploaderCode)) {
    throw new Error('Photo not found.')
  }

  if (!data.bucket_name || !data.storage_path) {
    throw new Error('Photo file is unavailable.')
  }

  return {
    bucketName: data.bucket_name,
    contentType: inferPortalContentType(
      data.original_file_name ?? 'download',
      typeof data.file_type === 'string' ? data.file_type : '',
    ),
    originalFileName: data.original_file_name ?? 'download',
    storagePath: data.storage_path,
  }
}

function formatPortalMaxUploadLabel(maxBytes: number) {
  if (maxBytes >= 1024 * 1024 * 1024 && maxBytes % (1024 * 1024 * 1024) === 0) {
    return `${maxBytes / (1024 * 1024 * 1024)} GB`
  }

  return `${maxBytes / (1024 * 1024)} MB`
}

function assertPortalUploadFileSize(fileName: string, contentType: string, fileSizeBytes: number) {
  const isVideo = isPortalVideoFile(fileName, contentType)
  const maxBytes = isVideo ? MAX_VIDEO_UPLOAD_BYTES : MAX_PHOTO_UPLOAD_BYTES

  if (fileSizeBytes > maxBytes) {
    throw new Error(
      `Each ${isVideo ? 'video' : 'photo'} must be ${formatPortalMaxUploadLabel(maxBytes)} or smaller.`,
    )
  }
}

async function getPortalFolderForUploader(folderId: string, uploaderCode: string) {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data: folder, error: folderError } = await supabaseAdmin
    .from('albums_folders')
    .select('id, folder_name, uploader_code')
    .eq('id', folderId)
    .eq('uploader_code', uploaderCode)
    .maybeSingle()

  if (folderError) throw new Error(folderError.message)
  if (!folder) throw new Error('Folder not found.')
  return folder
}

export type PortalUploadPresign = {
  bucketName: string
  contentType: string
  fileName: string
  index: number
  partSizeBytes?: number
  partUrls?: Array<{ partNumber: number; uploadUrl: string }>
  storagePath: string
  uploadId?: string
  uploadMode: 'multipart' | 'single'
  uploadUrl?: string
}

export type PortalUploadMultipartPart = {
  eTag: string
  partNumber: number
}

export async function createPortalUploadPresigns(params: {
  folderId: string
  files: Array<{ contentType: string; fileName: string; fileSizeBytes: number }>
  uploaderCode: string
}): Promise<PortalUploadPresign[]> {
  const user = await getPortalUser(params.uploaderCode)
  await getPortalFolderForUploader(params.folderId, params.uploaderCode)

  if (params.files.length === 0) {
    throw new Error('Choose at least one file.')
  }

  const uploads: PortalUploadPresign[] = []

  for (let index = 0; index < params.files.length; index++) {
    const file = params.files[index]
    const contentType = inferPortalContentType(file.fileName, file.contentType)
    const isVideo = isPortalVideoFile(file.fileName, contentType)

    if (!isAllowedPortalUpload(file.fileName, contentType)) {
      throw new Error('Only image and video files are allowed.')
    }

    assertPortalUploadFileSize(file.fileName, contentType, file.fileSizeBytes)

    const expiresInSeconds = isVideo ? VIDEO_PRESIGN_EXPIRY_SECONDS : DEFAULT_PRESIGN_EXPIRY_SECONDS
    const useMultipart = isVideo && file.fileSizeBytes > MULTIPART_VIDEO_THRESHOLD_BYTES

    if (useMultipart) {
      const presigned = await createPresignedMultipartUpload({
        contentType,
        expiresInSeconds,
        fileName: file.fileName,
        fileSizeBytes: file.fileSizeBytes,
        partSizeBytes: MULTIPART_PART_SIZE_BYTES,
        uploaderName: user.full_name,
      })

      uploads.push({
        index,
        fileName: file.fileName,
        bucketName: presigned.bucketName,
        storagePath: presigned.storagePath,
        contentType: presigned.contentType,
        uploadMode: 'multipart',
        uploadId: presigned.uploadId,
        partSizeBytes: presigned.partSizeBytes,
        partUrls: presigned.partUrls,
      })
      continue
    }

    const presigned = await createPresignedUploadObject({
      contentType,
      expiresInSeconds,
      fileName: file.fileName,
      uploaderName: user.full_name,
    })

    uploads.push({
      index,
      fileName: file.fileName,
      uploadUrl: presigned.uploadUrl,
      bucketName: presigned.bucketName,
      storagePath: presigned.storagePath,
      contentType: presigned.contentType,
      uploadMode: 'single',
    })
  }

  return uploads
}

export async function registerPortalPhotoUploads(params: {
  folderId: string
  uploads: Array<{
    bucketName: string
    contentType: string
    fileName: string
    fileSizeBytes: number
    multipart?: {
      parts: PortalUploadMultipartPart[]
      uploadId: string
    }
    storagePath: string
  }>
  uploaderCode: string
}) {
  const user = await getPortalUser(params.uploaderCode)
  const folder = await getPortalFolderForUploader(params.folderId, params.uploaderCode)
  const supabaseAdmin = createSupabaseAdminClient()

  if (params.uploads.length === 0) {
    throw new Error('No uploads to register.')
  }

  const photos: PortalPhoto[] = []

  for (const upload of params.uploads) {
    const contentType = upload.contentType || 'application/octet-stream'
    if (!upload.bucketName || !upload.storagePath) {
      throw new Error('Upload metadata is incomplete.')
    }

    assertPortalUploadFileSize(upload.fileName, contentType, upload.fileSizeBytes)

    if (upload.multipart) {
      if (!upload.multipart.uploadId || upload.multipart.parts.length === 0) {
        throw new Error('Multipart upload metadata is incomplete.')
      }

      await completeMultipartUploadObject({
        bucketName: upload.bucketName,
        storagePath: upload.storagePath,
        uploadId: upload.multipart.uploadId,
        parts: upload.multipart.parts,
      })
    }

    await assertStoredObjectByteLength({
      bucketName: upload.bucketName,
      storagePath: upload.storagePath,
      expectedBytes: upload.fileSizeBytes,
    })

    const imageUrl = buildPublicImageUrl(upload.bucketName, upload.storagePath)
    const { data, error } = await supabaseAdmin
      .from('albums_photos')
      .insert({
        album_user_id: user.id,
        uploader_code: user.code,
        uploader_name: user.full_name,
        folder_id: folder.id,
        bucket_name: upload.bucketName,
        storage_path: upload.storagePath,
        image_url: imageUrl,
        original_file_name: upload.fileName,
        file_type: contentType,
        file_size_bytes: upload.fileSizeBytes,
        place_name: folder.folder_name,
        type_of_place: params.uploaderCode === PUBLIC_PORTAL_CODE ? ['Public submission'] : ['Photographer portal'],
        tags:
          params.uploaderCode === PUBLIC_PORTAL_CODE
            ? ['public-upload', 'temp-portal']
            : ['photographer-portal', 'temp-portal'],
      })
      .select('id, folder_id, image_url, original_file_name, file_size_bytes, created_at')
      .single()

    if (error) throw new Error(error.message)
    photos.push(data as PortalPhoto)
  }

  return photos
}

export async function uploadPortalPhoto(params: {
  folderId: string
  uploaderCode: string
  fileName: string
  fileBuffer: Buffer
  contentType: string
}) {
  const contentType = params.contentType || 'application/octet-stream'
  assertPortalUploadFileSize(params.fileName, contentType, params.fileBuffer.length)

  const user = await getPortalUser(params.uploaderCode)
  const uploadedObject = await uploadOriginalMediaObject({
    contentType,
    fileBuffer: params.fileBuffer,
    fileName: params.fileName,
    uploaderName: user.full_name,
  })

  const [photo] = await registerPortalPhotoUploads({
    folderId: params.folderId,
    uploaderCode: params.uploaderCode,
    uploads: [
      {
        bucketName: uploadedObject.bucketName,
        contentType,
        fileName: params.fileName,
        fileSizeBytes: params.fileBuffer.length,
        storagePath: uploadedObject.storagePath,
      },
    ],
  })

  return photo
}

export async function renamePortalPhoto(id: string, originalFileName: string) {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('albums_photos')
    .update({ original_file_name: originalFileName.trim() })
    .eq('id', id)
    .select('id, folder_id, image_url, original_file_name, file_size_bytes, created_at')
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Photo not found.')
  return data as PortalPhoto
}

export async function deletePortalPhoto(id: string) {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data: photo, error: selectError } = await supabaseAdmin
    .from('albums_photos')
    .select('id, bucket_name, storage_path')
    .eq('id', id)
    .maybeSingle()

  if (selectError) throw new Error(selectError.message)
  if (!photo) throw new Error('Photo not found.')

  await deleteImageObject(photo.bucket_name, photo.storage_path)
  const { error } = await supabaseAdmin.from('albums_photos').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function replacePortalPhoto(id: string, file: File) {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data: photo, error: selectError } = await supabaseAdmin
    .from('albums_photos')
    .select('id, bucket_name, storage_path, uploader_name')
    .eq('id', id)
    .maybeSingle()

  if (selectError) throw new Error(selectError.message)
  if (!photo) throw new Error('Photo not found.')

  const fileBuffer = Buffer.from(await file.arrayBuffer())
  const contentType = file.type || 'application/octet-stream'
  const isVideo =
    contentType.toLowerCase().startsWith('video/') ||
    /\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(file.name)

  const maxBytes = isVideo ? MAX_VIDEO_UPLOAD_BYTES : MAX_PHOTO_UPLOAD_BYTES
  if (fileBuffer.length > maxBytes) {
    throw new Error(
      `Each ${isVideo ? 'video' : 'photo'} must be ${formatPortalMaxUploadLabel(maxBytes)} or smaller.`,
    )
  }

  await deleteImageObject(photo.bucket_name, photo.storage_path)

  const uploadedObject = await uploadOriginalMediaObject({
    contentType,
    fileBuffer,
    fileName: file.name,
    uploaderName: photo.uploader_name,
  })

  await assertStoredObjectByteLength({
    bucketName: uploadedObject.bucketName,
    storagePath: uploadedObject.storagePath,
    expectedBytes: fileBuffer.length,
  })

  const imageUrl = buildPublicImageUrl(uploadedObject.bucketName, uploadedObject.storagePath)
  const { data, error } = await supabaseAdmin
    .from('albums_photos')
    .update({
      bucket_name: uploadedObject.bucketName,
      storage_path: uploadedObject.storagePath,
      image_url: imageUrl,
      original_file_name: file.name,
      file_type: contentType,
      file_size_bytes: fileBuffer.length,
    })
    .eq('id', id)
    .select('id, folder_id, image_url, original_file_name, file_size_bytes, created_at')
    .single()

  if (error) throw new Error(error.message)
  return data as PortalPhoto
}

export { PHOTOGRAPHER_PORTAL_CODE, PUBLIC_PORTAL_CODE }
