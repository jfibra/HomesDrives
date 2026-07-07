import { getReelsMakerApiBase } from '@/lib/reels-maker/api-base'
import { formatApiError } from '@/lib/reels-maker/api-errors'
import { MAX_SERVER_PROXY_UPLOAD_BYTES } from '@/lib/photo-upload-limits'
import type { ReelLogoPosition } from '@/lib/reels-maker/types'

export const MAX_REEL_MUSIC_UPLOAD_BYTES = 50 * 1024 * 1024

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

export function shouldUseReelsPresignedUpload(params: {
  files: Array<{ size: number }>
  hasMusic: boolean
}) {
  if (typeof window === 'undefined') return false

  const pageIsHttps = window.location.protocol === 'https:'
  const apiBase = getReelsMakerApiBase()
  const viaVercelProxy = pageIsHttps && !apiBase

  if (viaVercelProxy) return true
  if (params.hasMusic) return true
  return params.files.some((file) => file.size > MAX_SERVER_PROXY_UPLOAD_BYTES)
}

async function uploadFileToPresignedUrl(file: File, presigned: PresignedReelUpload) {
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
  const allFiles: Array<{ clientId: string; file: File; role: PresignRequestFile['role']; note?: string }> =
    []

  params.media.forEach((item, index) => {
    allFiles.push({
      clientId: `media-${index}`,
      file: item.file,
      role: 'media',
      note: item.note,
    })
  })

  if (params.music) {
    if (params.music.size > MAX_REEL_MUSIC_UPLOAD_BYTES) {
      throw new Error('Music file is too large. Maximum size is 50 MB.')
    }
    allFiles.push({
      clientId: 'music',
      file: params.music,
      role: 'music',
    })
  }

  if (params.logo && params.logoEnabled) {
    allFiles.push({
      clientId: 'logo',
      file: params.logo,
      role: 'logo',
    })
  }

  const usePresigned = shouldUseReelsPresignedUpload({
    files: allFiles.map((entry) => ({ size: entry.file.size })),
    hasMusic: Boolean(params.music),
  })

  if (!usePresigned) {
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

  const presignResponse = await fetch(apiPath(`/api/reels-maker/jobs/${jobId}/upload/presign`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      files: allFiles.map((entry) => ({
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

  for (const entry of allFiles) {
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
      uploads: allFiles.map((entry) => {
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
