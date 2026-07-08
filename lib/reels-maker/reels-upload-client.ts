import { formatApiError } from '@/lib/reels-maker/api-errors'
import { uploadMusicViaServerChunks } from '@/lib/reels-maker/reels-music-chunk-upload'
import { MAX_REEL_MUSIC_UPLOAD_BYTES, MAX_SERVER_PROXY_UPLOAD_BYTES } from '@/lib/photo-upload-limits'
import type { ReelLogoPosition } from '@/lib/reels-maker/types'

export { MAX_REEL_MUSIC_UPLOAD_BYTES }

type PresignRequestFile = {
  clientId: string
  fileName: string
  contentType: string
  size: number
  role: 'media' | 'music' | 'logo'
}

type PresignedReelUpload = {
  clientId: string
  role: 'media' | 'music' | 'logo'
  uploadUrl: string
  bucketName: string
  storagePath: string
  contentType: string
}

type FinalizeUpload = {
  clientId: string
  role: 'media' | 'music' | 'logo'
  fileName: string
  mimeType: string
  bucketName: string
  storagePath: string
  userNote?: string
}

async function readApiJson(response: Response) {
  const text = await response.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { error: text }
  }
}

function isDirectStorageFetchError(error: unknown) {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase()
    return /failed to fetch|load failed|networkerror|network error|fetch/i.test(message)
  }
  return false
}

/** Only large files need browser→S3 presigned upload (avoids Vercel's ~4.5 MB body limit). */
export function shouldUseReelsPresignedUpload(params: { files: Array<{ size: number }> }) {
  if (typeof window === 'undefined') return false
  return params.files.some((file) => file.size > MAX_SERVER_PROXY_UPLOAD_BYTES)
}

function musicUsesChunkedServerUpload(music: File) {
  return music.size > MAX_SERVER_PROXY_UPLOAD_BYTES
}

async function uploadFileToPresignedUrl(file: File, presigned: PresignedReelUpload) {
  try {
    const response = await fetch(presigned.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': presigned.contentType || file.type || 'application/octet-stream',
      },
    })

    if (!response.ok) {
      throw new Error(`Direct upload failed for ${file.name} (HTTP ${response.status}).`)
    }
  } catch (error) {
    if (isDirectStorageFetchError(error)) {
      throw new Error(
        `Could not upload "${file.name}" directly to storage. Your S3 bucket may need browser upload CORS enabled (PUT from your site).`,
      )
    }
    throw error
  }
}

async function uploadViaFormData(
  jobId: string,
  params: {
    media: Array<{ file: File; note: string }>
    music?: File | null
    logo?: File | null
    logoEnabled: boolean
    logoPosition: ReelLogoPosition
  },
  apiPath: (path: string) => string,
) {
  const formData = new FormData()
  for (const item of params.media) {
    formData.append('files', item.file, item.file.name)
  }
  formData.append('mediaNotes', JSON.stringify(params.media.map((item) => item.note.trim())))
  if (params.music) {
    formData.append('music', params.music, params.music.name)
  }
  if (params.logo && params.logoEnabled) {
    formData.append('logo', params.logo, params.logo.name)
    formData.append('logoEnabled', 'true')
    formData.append('logoPosition', params.logoPosition)
  } else {
    formData.append('logoEnabled', 'false')
  }

  const response = await fetch(apiPath(`/api/reels-maker/jobs/${jobId}/upload`), {
    method: 'POST',
    body: formData,
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  const data = await readApiJson(response)
  if (!response.ok) {
    throw new Error(formatApiError(data.error, 'Upload failed.'))
  }
  return data
}

async function uploadMusicOnlyViaFormData(
  jobId: string,
  music: File,
  apiPath: (path: string) => string,
) {
  const formData = new FormData()
  formData.append('music', music, music.name)
  formData.append('logoEnabled', 'false')

  const response = await fetch(apiPath(`/api/reels-maker/jobs/${jobId}/upload`), {
    method: 'POST',
    body: formData,
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  const data = await readApiJson(response)
  if (!response.ok) {
    throw new Error(formatApiError(data.error, 'Music upload failed.'))
  }
  return data
}

async function uploadViaPresignedUrls(
  jobId: string,
  files: Array<{ clientId: string; file: File; role: PresignRequestFile['role']; note?: string }>,
  params: {
    logoEnabled: boolean
    logoPosition: ReelLogoPosition
  },
  apiPath: (path: string) => string,
) {
  const presignResponse = await fetch(apiPath(`/api/reels-maker/jobs/${jobId}/upload/presign`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      files: files.map((entry) => ({
        clientId: entry.clientId,
        fileName: entry.file.name,
        contentType: entry.file.type || 'application/octet-stream',
        size: entry.file.size,
        role: entry.role,
      })),
    }),
    cache: 'no-store',
  })
  const presignData = await readApiJson(presignResponse)
  if (!presignResponse.ok) {
    throw new Error(formatApiError(presignData.error, 'Unable to prepare uploads.'))
  }

  const uploads = (presignData.uploads as PresignedReelUpload[]) ?? []
  const uploadById = new Map(uploads.map((upload) => [upload.clientId, upload]))

  for (const entry of files) {
    const presigned = uploadById.get(entry.clientId)
    if (!presigned) {
      throw new Error(`Missing upload URL for ${entry.file.name}.`)
    }
    await uploadFileToPresignedUrl(entry.file, presigned)
  }

  const finalizeResponse = await fetch(apiPath(`/api/reels-maker/jobs/${jobId}/upload/finalize`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      uploads: files.map((entry) => {
        const presigned = uploadById.get(entry.clientId)!
        return {
          clientId: entry.clientId,
          role: entry.role,
          fileName: entry.file.name,
          mimeType: entry.file.type || presigned.contentType,
          bucketName: presigned.bucketName,
          storagePath: presigned.storagePath,
          userNote: entry.note?.trim() || undefined,
        } satisfies FinalizeUpload
      }),
      logoEnabled: params.logoEnabled,
      logoPosition: params.logoPosition,
    }),
    cache: 'no-store',
  })
  const finalizeData = await readApiJson(finalizeResponse)
  if (!finalizeResponse.ok) {
    throw new Error(formatApiError(finalizeData.error, 'Upload failed.'))
  }

  return finalizeData
}

export async function uploadReelJobAssets(
  jobId: string,
  params: {
    media: Array<{ file: File; note: string }>
    music?: File | null
    logo?: File | null
    logoEnabled: boolean
    logoPosition: ReelLogoPosition
  },
  apiPath: (path: string) => string,
) {
  if (params.music && params.music.size > MAX_REEL_MUSIC_UPLOAD_BYTES) {
    throw new Error('Music file is too large. Maximum size is 50 MB.')
  }

  const assetFiles: Array<{ clientId: string; file: File; role: PresignRequestFile['role']; note?: string }> =
    []

  params.media.forEach((item, index) => {
    assetFiles.push({
      clientId: `media-${index}`,
      file: item.file,
      role: 'media',
      note: item.note,
    })
  })

  if (params.logo && params.logoEnabled) {
    assetFiles.push({
      clientId: 'logo',
      file: params.logo,
      role: 'logo',
    })
  }

  const music = params.music ?? null
  const musicViaChunks = music ? musicUsesChunkedServerUpload(music) : false
  const musicViaFormData = music ? !musicViaChunks : false
  const usePresignedForAssets = shouldUseReelsPresignedUpload({
    files: assetFiles.map((entry) => ({ size: entry.file.size })),
  })

  let uploadData: Record<string, unknown>

  if (!usePresignedForAssets) {
    uploadData = await uploadViaFormData(jobId, {
      ...params,
      music: musicViaFormData ? music : null,
    }, apiPath)
  } else if (assetFiles.length) {
    uploadData = await uploadViaPresignedUrls(jobId, assetFiles, params, apiPath)
  } else {
    uploadData = { job: null }
  }

  if (music && musicViaChunks) {
    uploadData = await uploadMusicViaServerChunks(jobId, music, apiPath)
  } else if (music && usePresignedForAssets && musicViaFormData) {
    uploadData = await uploadMusicOnlyViaFormData(jobId, music, apiPath)
  }

  return uploadData
}
