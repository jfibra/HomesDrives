type PipedAudioStream = {
  url?: string
  format?: string
  mimeType?: string
  bitrate?: number
  videoOnly?: boolean
}

export type PipedStreamsResponse = {
  title?: string
  uploader?: string
  duration?: number
  thumbnailUrl?: string
  audioStreams?: PipedAudioStream[]
}

const DEFAULT_PIPED_INSTANCES = [
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.in.projectsegfau.lt',
  'https://pipedapi.kavin.rocks',
]

function pipedInstances(): string[] {
  const configured = process.env.PIPED_API_URL?.trim()
  if (configured) {
    return [configured.replace(/\/$/, '')]
  }

  const list = process.env.PIPED_API_INSTANCES?.split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean)

  return list?.length ? list : DEFAULT_PIPED_INSTANCES
}

function pipedDisabled() {
  return /^(1|true|yes|on)$/i.test(process.env.PIPED_API_DISABLED?.trim() || '')
}

async function fetchPipedJson<T>(path: string): Promise<T> {
  let lastError: Error | null = null

  for (const base of pipedInstances()) {
    try {
      const response = await fetch(`${base}${path}`, {
        headers: { 'User-Agent': 'HomesDrives-reels-maker/1.0' },
        signal: AbortSignal.timeout(20_000),
      })

      if (!response.ok) {
        lastError = new Error(`Piped ${base} returned ${response.status}`)
        continue
      }

      return (await response.json()) as T
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.warn(`[reels-maker/youtube/piped] ${base} failed:`, lastError.message)
    }
  }

  throw lastError ?? new Error('All Piped API instances failed.')
}

export async function fetchPipedStreams(videoId: string) {
  if (pipedDisabled()) {
    throw new Error('Piped API fallback is disabled.')
  }

  const data = await fetchPipedJson<PipedStreamsResponse>(`/streams/${videoId}`)
  if (!data.audioStreams?.length) {
    throw new Error('Piped API returned no audio streams for this video.')
  }

  return data
}

function pickBestPipedAudioStream(streams: PipedAudioStream[]) {
  const candidates = streams.filter((stream) => stream.url?.trim())
  if (!candidates.length) return null

  const scored = [...candidates].sort((a, b) => {
    const aM4a = /m4a|mp4/i.test(`${a.format} ${a.mimeType}`)
    const bM4a = /m4a|mp4/i.test(`${b.format} ${b.mimeType}`)
    if (aM4a !== bM4a) return aM4a ? -1 : 1
    return (b.bitrate ?? 0) - (a.bitrate ?? 0)
  })

  return scored[0] ?? null
}

function extensionForPipedStream(stream: PipedAudioStream) {
  const format = stream.format?.toLowerCase() ?? ''
  if (format.includes('m4a') || format.includes('mp4')) return 'm4a'
  if (format.includes('webm')) return 'webm'
  if (format.includes('opus')) return 'opus'
  if (stream.mimeType?.includes('webm')) return 'webm'
  if (stream.mimeType?.includes('mp4')) return 'm4a'
  return 'm4a'
}

function mimeTypeForPipedStream(stream: PipedAudioStream, extension: string) {
  if (stream.mimeType?.trim()) return stream.mimeType.trim()
  switch (extension) {
    case 'webm':
      return 'audio/webm'
    case 'opus':
      return 'audio/opus'
    case 'm4a':
    default:
      return 'audio/mp4'
  }
}

export async function downloadAudioViaPiped(videoId: string) {
  const meta = await fetchPipedStreams(videoId)
  const stream = pickBestPipedAudioStream(meta.audioStreams ?? [])
  if (!stream?.url) {
    throw new Error('Piped API did not return a downloadable audio URL.')
  }

  const response = await fetch(stream.url, {
    headers: { 'User-Agent': 'HomesDrives-reels-maker/1.0' },
    signal: AbortSignal.timeout(180_000),
  })

  if (!response.ok) {
    throw new Error(`Piped audio download failed with HTTP ${response.status}.`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.length) {
    throw new Error('Piped audio download returned an empty file.')
  }

  const extension = extensionForPipedStream(stream)

  return {
    buffer,
    extension,
    mimeType: mimeTypeForPipedStream(stream, extension),
    title: meta.title?.trim() || 'YouTube track',
    durationSeconds: typeof meta.duration === 'number' ? meta.duration : null,
    thumbnailUrl: meta.thumbnailUrl ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    channel: meta.uploader?.trim() || 'YouTube',
  }
}
