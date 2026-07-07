import { cobaltApiKeyConfigured, fetchCobaltAudioUrl } from '@/lib/reels-maker/youtube-cobalt'
import { fetchInvidiousVideo } from '@/lib/reels-maker/youtube-invidious'
import { fetchPipedStreams } from '@/lib/reels-maker/youtube-piped'
import { normalizeYouTubeUrl } from '@/lib/reels-maker/youtube-url'

export type YouTubeStreamInfo = {
  videoId: string
  title: string
  streamUrl: string
  source: 'invidious' | 'cobalt' | 'piped'
  muxed: boolean
  extension: string
  mimeType: string
  /** True when the URL points at googlevideo.com (browser may need Cobalt instead). */
  directCdn: boolean
}

function extensionFromMime(mimeType: string | undefined, fallback = 'm4a') {
  if (!mimeType) return fallback
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a'
  return fallback
}

function mimeFromExtension(extension: string) {
  switch (extension) {
    case 'webm':
      return 'audio/webm'
    case 'mp3':
      return 'audio/mpeg'
    case 'm4a':
    default:
      return 'audio/mp4'
  }
}

function isGoogleVideoUrl(url: string) {
  try {
    return new URL(url).hostname.includes('googlevideo.com')
  } catch {
    return url.includes('googlevideo.com')
  }
}

function pickPipedStream(meta: Awaited<ReturnType<typeof fetchPipedStreams>>) {
  const audioStreams = [...(meta.audioStreams ?? [])].filter((stream) => stream.url?.trim())
  audioStreams.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))
  if (audioStreams[0]?.url) {
    const stream = audioStreams[0]
    const extension = extensionFromMime(stream.mimeType, 'm4a')
    return {
      streamUrl: stream.url!.trim(),
      muxed: false,
      extension,
      mimeType: stream.mimeType?.startsWith('audio/') ? stream.mimeType : mimeFromExtension(extension),
    }
  }

  const muxed = [...(meta.videoStreams ?? [])]
    .filter((stream) => stream.url?.trim() && !stream.videoOnly)
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]

  if (muxed?.url) {
    const extension = extensionFromMime(muxed.mimeType, 'm4a')
    return {
      streamUrl: muxed.url.trim(),
      muxed: true,
      extension,
      mimeType: muxed.mimeType?.startsWith('audio/') ? muxed.mimeType : mimeFromExtension(extension),
    }
  }

  return null
}

export async function resolveYouTubeStreamInfo(rawUrl: string): Promise<YouTubeStreamInfo> {
  const normalized = normalizeYouTubeUrl(rawUrl)
  if (!normalized) {
    throw new Error('Paste a valid YouTube music link.')
  }

  const videoId = normalized.split('v=')[1]?.split('&')[0]
  if (!videoId) {
    throw new Error('Could not parse YouTube video id.')
  }

  if (cobaltApiKeyConfigured()) {
    try {
      const cobalt = await fetchCobaltAudioUrl(normalized)
      return {
        videoId,
        title: 'YouTube track',
        streamUrl: cobalt.url,
        source: 'cobalt',
        muxed: false,
        extension: 'mp3',
        mimeType: 'audio/mpeg',
        directCdn: false,
      }
    } catch (cobaltError) {
      console.warn(
        '[reels-maker/youtube/stream-info] Cobalt failed, trying other sources:',
        cobaltError instanceof Error ? cobaltError.message : cobaltError,
      )
    }
  }

  let invidiousError: Error | null = null
  try {
    const { video, picked } = await fetchInvidiousVideo(videoId)
    if (picked.url && !isGoogleVideoUrl(picked.url)) {
      const extension = picked.muxed
        ? 'm4a'
        : extensionFromMime(picked.format.type, picked.format.type?.includes('webm') ? 'webm' : 'm4a')
      return {
        videoId,
        title: video.title?.trim() || 'YouTube track',
        streamUrl: picked.url,
        source: 'invidious',
        muxed: picked.muxed,
        extension,
        mimeType: picked.muxed ? 'audio/mp4' : mimeFromExtension(extension),
        directCdn: false,
      }
    }
  } catch (error) {
    invidiousError = error instanceof Error ? error : new Error(String(error))
  }

  try {
    const cobalt = await fetchCobaltAudioUrl(normalized)
    return {
      videoId,
      title: 'YouTube track',
      streamUrl: cobalt.url,
      source: 'cobalt',
      muxed: false,
      extension: 'mp3',
      mimeType: 'audio/mpeg',
      directCdn: false,
    }
  } catch (cobaltError) {
    const cobaltMessage = cobaltError instanceof Error ? cobaltError.message : String(cobaltError)

    try {
      const piped = await fetchPipedStreams(videoId)
      const picked = pickPipedStream(piped)
      if (picked) {
        const directCdn = isGoogleVideoUrl(picked.streamUrl)
        if (directCdn) {
          throw new Error(
            `Only direct YouTube CDN URLs are available (${cobaltMessage}). Browser download is not possible without Cobalt or Invidious.`,
          )
        }

        return {
          videoId,
          title: piped.title?.trim() || 'YouTube track',
          streamUrl: picked.streamUrl,
          source: 'piped',
          muxed: picked.muxed,
          extension: picked.extension,
          mimeType: picked.mimeType,
          directCdn,
        }
      }
    } catch (pipedError) {
      const pipedMessage = pipedError instanceof Error ? pipedError.message : String(pipedError)
      throw new Error(
        invidiousError
          ? `YouTube stream lookup failed. Invidious: ${invidiousError.message}. Cobalt: ${cobaltMessage}. Piped: ${pipedMessage}`
          : `YouTube stream lookup failed. Cobalt: ${cobaltMessage}. Piped: ${pipedMessage}`,
      )
    }

    throw new Error(
      invidiousError
        ? `YouTube stream lookup failed. Invidious: ${invidiousError.message}. Cobalt: ${cobaltMessage}`
        : `YouTube stream lookup failed. Cobalt: ${cobaltMessage}`,
    )
  }
}
