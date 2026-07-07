import { resolveCobaltBrowserAudio } from '@/lib/reels-maker/youtube-cobalt-browser'
import {
  resolveYouTubeStreamInBrowser,
  type BrowserYouTubeStream,
} from '@/lib/reels-maker/youtube-browser-resolve'
import { parseYouTubeVideoId } from '@/lib/reels-maker/youtube-url'

export type YouTubeBrowserDownloadProgress = {
  loaded: number
  total: number | null
}

export type YouTubeBrowserDownloadOptions = {
  onProgress?: (progress: YouTubeBrowserDownloadProgress) => void
  onStatus?: (message: string) => void
  requestTurnstile?: (sitekey: string) => Promise<string>
}

async function downloadStreamUrl(
  streamUrl: string,
  onProgress?: (progress: YouTubeBrowserDownloadProgress) => void,
) {
  const response = await fetch(streamUrl, { cache: 'no-store' })
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

function toCobaltMusicFile(videoId: string, fileName: string, buffer: ArrayBuffer) {
  const safeName = fileName.endsWith('.mp3') ? fileName : `youtube-${videoId}.mp3`
  return new File([buffer], safeName, { type: 'audio/mpeg' })
}

/**
 * Downloads YouTube audio in the user's browser (residential IP), then returns a File
 * ready to upload to reels-api. Avoids AWS/datacenter CDN blocks on EC2.
 */
export async function downloadYouTubeAudioInBrowser(
  youtubeUrl: string,
  options?: YouTubeBrowserDownloadOptions,
): Promise<File> {
  const videoId = parseYouTubeVideoId(youtubeUrl)
  if (!videoId) {
    throw new Error('Paste a valid YouTube music link.')
  }

  let lastError: Error | null = null

  options?.onStatus?.('Looking up YouTube audio stream…')
  try {
    const stream = await resolveYouTubeStreamInBrowser(youtubeUrl)
    options?.onStatus?.('Downloading YouTube music in your browser…')
    const buffer = await downloadStreamUrl(stream.streamUrl, options?.onProgress)
    return toMusicFile(stream, buffer)
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error))
  }

  if (options?.requestTurnstile) {
    try {
      options.onStatus?.('Complete the security check to download YouTube audio…')
      const cobalt = await resolveCobaltBrowserAudio(youtubeUrl, options.requestTurnstile)
      options.onStatus?.('Downloading YouTube music in your browser…')
      const buffer = await downloadStreamUrl(cobalt.streamUrl, options?.onProgress)
      return toCobaltMusicFile(videoId, cobalt.fileName, buffer)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw new Error(
    `${lastError?.message || 'Unable to download YouTube music.'} Try Upload MP3 instead.`,
  )
}
