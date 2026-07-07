import { reelsMakerApiPath } from '@/lib/reels-maker/api-base'
import {
  resolveYouTubeStreamInBrowser,
  type BrowserYouTubeStream,
} from '@/lib/reels-maker/youtube-browser-resolve'

export type YouTubeBrowserDownloadProgress = {
  loaded: number
  total: number | null
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

async function resolveStreamViaApi(youtubeUrl: string): Promise<BrowserYouTubeStream> {
  const response = await fetch(reelsMakerApiPath('/api/reels-maker/youtube/stream-info'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ url: youtubeUrl }),
    cache: 'no-store',
  })
  const data = await readApiJson(response)
  if (!response.ok) {
    throw new Error(String(data.error || 'Unable to resolve YouTube audio stream.'))
  }

  const stream = data.stream as BrowserYouTubeStream & { source: 'invidious' | 'cobalt' | 'piped' }
  if (!stream?.streamUrl) {
    throw new Error('Stream lookup returned an invalid response.')
  }

  return stream
}

async function downloadStreamUrl(
  stream: BrowserYouTubeStream,
  onProgress?: (progress: YouTubeBrowserDownloadProgress) => void,
) {
  const response = await fetch(stream.streamUrl, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Audio download failed with HTTP ${response.status}.`)
  }

  const total = Number(response.headers.get('content-length') || 0) || null
  const reader = response.body?.getReader()
  if (!reader) {
    const buffer = await response.arrayBuffer()
    if (!buffer.byteLength) throw new Error('Audio download returned an empty file.')
    onProgress?.({ loaded: buffer.byteLength, total: buffer.byteLength })
    return buffer
  }

  const chunks: Uint8Array[] = []
  let loaded = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value?.length) {
      chunks.push(value)
      loaded += value.length
      onProgress?.({ loaded, total })
    }
  }

  if (!loaded) {
    throw new Error('Audio download returned an empty file.')
  }

  const merged = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }

  return merged.buffer
}

function toMusicFile(stream: BrowserYouTubeStream, buffer: ArrayBuffer) {
  const extension = stream.muxed ? 'mp4' : stream.extension
  const fileName = `youtube-${stream.videoId}.${extension}`
  const mimeType = stream.muxed ? 'video/mp4' : stream.mimeType || 'audio/mpeg'
  return new File([buffer], fileName, { type: mimeType })
}

/**
 * Downloads YouTube audio in the user's browser (residential IP), then returns a File
 * ready to upload to reels-api. Avoids AWS/datacenter CDN blocks on EC2.
 */
export async function downloadYouTubeAudioInBrowser(
  youtubeUrl: string,
  options?: {
    onProgress?: (progress: YouTubeBrowserDownloadProgress) => void
  },
): Promise<File> {
  const resolveAttempts = [
    () => resolveYouTubeStreamInBrowser(youtubeUrl),
    () => resolveStreamViaApi(youtubeUrl),
  ]

  let lastError: Error | null = null

  for (const resolve of resolveAttempts) {
    try {
      const stream = await resolve()
      const buffer = await downloadStreamUrl(stream, options?.onProgress)
      return toMusicFile(stream, buffer)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw new Error(
    `${lastError?.message || 'Unable to download YouTube music.'} Try Upload MP3 instead.`,
  )
}
