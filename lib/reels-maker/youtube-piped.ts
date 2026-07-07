import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'

import { safeRemoveDir } from '@/lib/reels-maker/safe-rm'

const execFileAsync = promisify(execFile)

type PipedStream = {
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
  audioStreams?: PipedStream[]
  videoStreams?: PipedStream[]
}

const DEFAULT_PIPED_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.moomoo.me',
]

let cachedInstances: string[] | null = null
let cachedInstancesAt = 0

function pipedDisabled() {
  return /^(1|true|yes|on)$/i.test(process.env.PIPED_API_DISABLED?.trim() || '')
}

async function discoverPipedInstances(): Promise<string[]> {
  if (cachedInstances && Date.now() - cachedInstancesAt < 60 * 60 * 1000) {
    return cachedInstances
  }

  try {
    const response = await fetch('https://piped-instances.kavin.rocks/', {
      signal: AbortSignal.timeout(10_000),
    })
    if (response.ok) {
      const data = (await response.json()) as Array<{ api_url?: string }>
      const discovered = data.map((entry) => entry.api_url?.trim().replace(/\/$/, '')).filter(Boolean) as string[]
      if (discovered.length) {
        cachedInstances = discovered
        cachedInstancesAt = Date.now()
        return discovered
      }
    }
  } catch (error) {
    console.warn('[reels-maker/youtube/piped] instance discovery failed:', error)
  }

  return DEFAULT_PIPED_INSTANCES
}

async function pipedInstances(): Promise<string[]> {
  const configured = process.env.PIPED_API_URL?.trim()
  if (configured) {
    return [configured.replace(/\/$/, '')]
  }

  const list = process.env.PIPED_API_INSTANCES?.split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean)

  if (list?.length) return list

  return discoverPipedInstances()
}

async function fetchPipedJson<T>(path: string): Promise<T> {
  let lastError: Error | null = null

  for (const base of await pipedInstances()) {
    try {
      const response = await fetch(`${base}${path}`, {
        headers: { 'User-Agent': 'HomesDrives-reels-maker/1.0' },
        signal: AbortSignal.timeout(25_000),
      })

      if (!response.ok) {
        lastError = new Error(`Piped ${base} returned ${response.status}`)
        continue
      }

      const text = await response.text()
      if (!text.trim().startsWith('{')) {
        lastError = new Error(`Piped ${base} returned non-JSON`)
        continue
      }

      return JSON.parse(text) as T
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.warn(`[reels-maker/youtube/piped] ${base} failed:`, lastError.message)
    }
  }

  throw lastError ?? new Error('All Piped API instances failed.')
}

function hasDownloadableStream(data: PipedStreamsResponse) {
  const audio = (data.audioStreams ?? []).some((stream) => stream.url?.trim())
  const muxed = (data.videoStreams ?? []).some((stream) => stream.url?.trim() && !stream.videoOnly)
  return audio || muxed
}

export async function fetchPipedStreams(videoId: string) {
  if (pipedDisabled()) {
    throw new Error('Piped API fallback is disabled.')
  }

  const data = await fetchPipedJson<PipedStreamsResponse>(`/streams/${videoId}`)
  if (!hasDownloadableStream(data)) {
    throw new Error('Piped API returned no downloadable streams for this video.')
  }

  return data
}

function pickBestPipedStream(streams: PipedStream[]) {
  const candidates = streams.filter((stream) => stream.url?.trim())
  if (!candidates.length) return null

  const scored = [...candidates].sort((a, b) => {
    const aM4a = /m4a|mp4|mpeg/i.test(`${a.format} ${a.mimeType}`)
    const bM4a = /m4a|mp4|mpeg/i.test(`${b.format} ${b.mimeType}`)
    if (aM4a !== bM4a) return aM4a ? -1 : 1
    return (b.bitrate ?? 0) - (a.bitrate ?? 0)
  })

  return scored[0] ?? null
}

function pickDownloadableStream(meta: PipedStreamsResponse) {
  const audio = pickBestPipedStream(meta.audioStreams ?? [])
  if (audio) return { stream: audio, muxed: false }

  const muxedCandidates = (meta.videoStreams ?? []).filter((stream) => stream.url?.trim() && !stream.videoOnly)
  const muxed = pickBestPipedStream(muxedCandidates)
  if (muxed) return { stream: muxed, muxed: true }

  return null
}

function extensionForPipedStream(stream: PipedStream) {
  const format = stream.format?.toLowerCase() ?? ''
  if (format.includes('m4a') || format.includes('mp4') || format.includes('mpeg')) return 'm4a'
  if (format.includes('webm')) return 'webm'
  if (format.includes('opus')) return 'opus'
  if (stream.mimeType?.includes('webm')) return 'webm'
  if (stream.mimeType?.includes('mp4')) return 'm4a'
  return 'm4a'
}

function mimeTypeForPipedStream(stream: PipedStream, extension: string) {
  if (stream.mimeType?.trim() && stream.mimeType.startsWith('audio/')) {
    return stream.mimeType.trim()
  }

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

function resolveFfmpegBinary() {
  const candidates = [
    process.env.FFMPEG_PATH,
    join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),
    join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
    'ffmpeg',
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    if (candidate === 'ffmpeg' || existsSync(candidate)) {
      return candidate
    }
  }

  return 'ffmpeg'
}

async function extractAudioFromMuxedVideo(videoBuffer: Buffer) {
  const workDir = await mkdtemp(join(tmpdir(), 'reels-piped-'))
  try {
    const inputPath = join(workDir, 'input.mp4')
    const outputPath = join(workDir, 'output.m4a')
    await writeFile(inputPath, videoBuffer)
    await execFileAsync(resolveFfmpegBinary(), [
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-acodec',
      'aac',
      '-b:a',
      '192k',
      outputPath,
    ])
    const buffer = await readFile(outputPath)
    if (!buffer.length) {
      throw new Error('ffmpeg produced an empty audio file.')
    }
    return buffer
  } finally {
    await safeRemoveDir(workDir)
  }
}

export async function downloadAudioViaPiped(videoId: string) {
  const meta = await fetchPipedStreams(videoId)
  const picked = pickDownloadableStream(meta)
  if (!picked?.stream.url) {
    throw new Error('Piped API did not return a downloadable stream URL.')
  }

  const response = await fetch(picked.stream.url, {
    headers: { 'User-Agent': 'HomesDrives-reels-maker/1.0' },
    signal: AbortSignal.timeout(300_000),
  })

  if (!response.ok) {
    throw new Error(`Piped stream download failed with HTTP ${response.status}.`)
  }

  let buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.length) {
    throw new Error('Piped stream download returned an empty file.')
  }

  let extension = extensionForPipedStream(picked.stream)
  let mimeType = mimeTypeForPipedStream(picked.stream, extension)

  if (picked.muxed) {
    console.info('[reels-maker/youtube/piped] extracting audio from muxed stream via ffmpeg')
    buffer = await extractAudioFromMuxedVideo(buffer)
    extension = 'm4a'
    mimeType = 'audio/mp4'
  }

  return {
    buffer,
    extension,
    mimeType,
    title: meta.title?.trim() || 'YouTube track',
    durationSeconds: typeof meta.duration === 'number' ? meta.duration : null,
    thumbnailUrl: meta.thumbnailUrl ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    channel: meta.uploader?.trim() || 'YouTube',
  }
}
