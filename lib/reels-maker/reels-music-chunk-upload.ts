import { MAX_REEL_MUSIC_UPLOAD_BYTES } from '@/lib/photo-upload-limits'
import { formatApiError } from '@/lib/reels-maker/api-errors'

/** Keep each chunk under Vercel's ~4.5 MB request body limit. */
export const REEL_MUSIC_CHUNK_BYTES = 3 * 1024 * 1024

async function readApiJson(response: Response) {
  const text = await response.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { error: text }
  }
}

export async function uploadMusicViaServerChunks(
  jobId: string,
  file: File,
  apiPath: (path: string) => string,
) {
  if (file.size > MAX_REEL_MUSIC_UPLOAD_BYTES) {
    throw new Error('Music file is too large. Maximum size is 50 MB.')
  }

  const uploadId = crypto.randomUUID()
  const totalChunks = Math.max(1, Math.ceil(file.size / REEL_MUSIC_CHUNK_BYTES))
  const mimeType = file.type?.trim() || 'audio/mpeg'

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * REEL_MUSIC_CHUNK_BYTES
    const chunk = file.slice(start, Math.min(start + REEL_MUSIC_CHUNK_BYTES, file.size))
    const formData = new FormData()
    formData.append('uploadId', uploadId)
    formData.append('chunkIndex', String(chunkIndex))
    formData.append('totalChunks', String(totalChunks))
    formData.append('fileName', file.name)
    formData.append('mimeType', mimeType)
    formData.append('chunk', chunk, `${file.name}.part-${chunkIndex}`)

    const response = await fetch(apiPath(`/api/reels-maker/jobs/${jobId}/upload/music-chunk`), {
      method: 'POST',
      body: formData,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    const data = await readApiJson(response)
    if (!response.ok) {
      throw new Error(formatApiError(data.error, `Music upload failed on chunk ${chunkIndex + 1}.`))
    }

    if (data.job) {
      return data
    }
  }

  throw new Error('Music upload did not complete.')
}
