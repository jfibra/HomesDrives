import { parseYouTubeVideoId } from '@/lib/reels-maker/youtube-url'

export type BrowserYouTubeStream = {
  videoId: string
  title: string
  streamUrl: string
  source: 'invidious' | 'piped' | 'cobalt'
  muxed: boolean
  extension: string
  mimeType: string
}

type InvidiousFormat = {
  url?: string
  type?: string
  bitrate?: string
}

type InvidiousVideo = {
  title?: string
  adaptiveFormats?: InvidiousFormat[]
  formatStreams?: InvidiousFormat[]
}

type PipedStream = {
  url?: string
  format?: string
  mimeType?: string
  bitrate?: number
  videoOnly?: boolean
}

type PipedStreamsResponse = {
  title?: string
  audioStreams?: PipedStream[]
  videoStreams?: PipedStream[]
}

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.f5.si',
  'https://invidious.tiekoetter.com',
  'https://yewtu.be',
  'https://invidious.nerdvpn.de',
]

const PIPED_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.moomoo.me',
]

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
    case 'mp4':
      return 'video/mp4'
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

function resolveAbsoluteUrl(base: string, url: string) {
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (url.startsWith('/')) return `${base}${url}`
  return `${base}/${url}`
}

function pickInvidiousStream(instance: string, video: InvidiousVideo) {
  const audioCandidates = (video.adaptiveFormats ?? [])
    .filter((fmt) => fmt.url && fmt.type?.startsWith('audio/'))
    .sort((a, b) => Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0))

  for (const fmt of audioCandidates) {
    const absolute = resolveAbsoluteUrl(instance, fmt.url!)
    if (!isGoogleVideoUrl(absolute)) {
      const extension = extensionFromMime(fmt.type, fmt.type?.includes('webm') ? 'webm' : 'm4a')
      return {
        streamUrl: absolute,
        muxed: false,
        extension,
        mimeType: mimeFromExtension(extension),
      }
    }
  }

  const muxedCandidates = (video.formatStreams ?? []).filter((fmt) => fmt.url && fmt.type?.includes('video/'))
  for (const fmt of muxedCandidates) {
    const absolute = resolveAbsoluteUrl(instance, fmt.url!)
    if (!isGoogleVideoUrl(absolute)) {
      return {
        streamUrl: absolute,
        muxed: true,
        extension: 'mp4',
        mimeType: 'video/mp4',
      }
    }
  }

  return null
}

function pickPipedStream(meta: PipedStreamsResponse) {
  const audioStreams = [...(meta.audioStreams ?? [])]
    .filter((stream) => stream.url?.trim())
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))

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
    return {
      streamUrl: muxed.url.trim(),
      muxed: true,
      extension: 'mp4',
      mimeType: 'video/mp4',
    }
  }

  return null
}

async function resolveViaInvidious(videoId: string): Promise<BrowserYouTubeStream | null> {
  let lastError: Error | null = null

  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const response = await fetch(`${instance}/api/v1/videos/${videoId}?local=true`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      if (!response.ok) {
        lastError = new Error(`Invidious ${instance} returned ${response.status}`)
        continue
      }

      const video = (await response.json()) as InvidiousVideo
      const picked = pickInvidiousStream(instance, video)
      if (!picked) {
        lastError = new Error(`Invidious ${instance} returned no proxied streams`)
        continue
      }

      return {
        videoId,
        title: video.title?.trim() || 'YouTube track',
        source: 'invidious',
        ...picked,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  if (lastError) throw lastError
  return null
}

async function resolveViaPiped(videoId: string): Promise<BrowserYouTubeStream | null> {
  let lastError: Error | null = null

  for (const instance of PIPED_INSTANCES) {
    try {
      const response = await fetch(`${instance}/streams/${videoId}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      if (!response.ok) {
        lastError = new Error(`Piped ${instance} returned ${response.status}`)
        continue
      }

      const text = await response.text()
      if (!text.trim().startsWith('{')) {
        lastError = new Error(`Piped ${instance} returned non-JSON`)
        continue
      }

      const meta = JSON.parse(text) as PipedStreamsResponse
      const picked = pickPipedStream(meta)
      if (!picked) {
        lastError = new Error(`Piped ${instance} returned no streams`)
        continue
      }

      if (isGoogleVideoUrl(picked.streamUrl)) {
        lastError = new Error(`Piped ${instance} returned a direct CDN URL`)
        continue
      }

      return {
        videoId,
        title: meta.title?.trim() || 'YouTube track',
        source: 'piped',
        ...picked,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  if (lastError) throw lastError
  return null
}

/** Resolve a proxied stream URL from the user's browser so Piped/Invidious IP binding matches download. */
export async function resolveYouTubeStreamInBrowser(youtubeUrl: string): Promise<BrowserYouTubeStream> {
  const videoId = parseYouTubeVideoId(youtubeUrl)
  if (!videoId) {
    throw new Error('Paste a valid YouTube music link.')
  }

  let invidiousError: Error | null = null
  try {
    const invidious = await resolveViaInvidious(videoId)
    if (invidious) return invidious
  } catch (error) {
    invidiousError = error instanceof Error ? error : new Error(String(error))
  }

  try {
    const piped = await resolveViaPiped(videoId)
    if (piped) return piped
  } catch (pipedError) {
    const pipedMessage = pipedError instanceof Error ? pipedError.message : String(pipedError)
    throw new Error(
      invidiousError
        ? `Could not resolve YouTube audio. Invidious: ${invidiousError.message}. Piped: ${pipedMessage}`
        : `Could not resolve YouTube audio. Piped: ${pipedMessage}`,
    )
  }

  throw new Error(
    invidiousError?.message || 'Could not resolve a downloadable YouTube audio stream.',
  )
}
