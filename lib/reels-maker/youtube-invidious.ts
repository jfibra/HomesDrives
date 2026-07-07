import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'

import { safeRemoveDir } from '@/lib/reels-maker/safe-rm'

const execFileAsync = promisify(execFile)

type InvidiousFormat = {
  url?: string
  type?: string
  container?: string
  bitrate?: string
  qualityLabel?: string
}

export type InvidiousVideo = {
  title?: string
  author?: string
  lengthSeconds?: number
  videoThumbnails?: Array<{ url?: string; quality?: string }>
  adaptiveFormats?: InvidiousFormat[]
  formatStreams?: InvidiousFormat[]
}

const DEFAULT_INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.f5.si',
  'https://invidious.tiekoetter.com',
  'https://inv.zoomerville.com',
]

function invidiousDisabled() {
  return /^(1|true|yes|on)$/i.test(process.env.INVIDIOUS_API_DISABLED?.trim() || '')
}

function invidiousInstances(): string[] {
  const configured = process.env.INVIDIOUS_API_URL?.trim()
  if (configured) return [configured.replace(/\/$/, '')]

  const list = process.env.INVIDIOUS_API_INSTANCES?.split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean)

  return list?.length ? list : DEFAULT_INVIDIOUS_INSTANCES
}

function resolveAbsoluteUrl(instance: string, url: string) {
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (url.startsWith('/')) return `${instance}${url}`
  return `${instance}/${url}`
}

function isProxiedByInstance(instance: string, url: string) {
  try {
    const host = new URL(instance).host
    return url.includes(host) || !url.includes('googlevideo.com')
  } catch {
    return !url.includes('googlevideo.com')
  }
}

function pickInvidiousStream(instance: string, video: InvidiousVideo) {
  const audioCandidates = (video.adaptiveFormats ?? [])
    .filter((fmt) => fmt.url && fmt.type?.startsWith('audio/'))
    .sort((a, b) => Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0))

  for (const fmt of audioCandidates) {
    const absolute = resolveAbsoluteUrl(instance, fmt.url!)
    if (isProxiedByInstance(instance, absolute)) {
      return { url: absolute, muxed: false, format: fmt }
    }
  }

  const muxedCandidates = (video.formatStreams ?? []).filter((fmt) => fmt.url && fmt.type?.includes('video/'))
  for (const fmt of muxedCandidates) {
    const absolute = resolveAbsoluteUrl(instance, fmt.url!)
    if (isProxiedByInstance(instance, absolute)) {
      return { url: absolute, muxed: true, format: fmt }
    }
  }

  return null
}

export async function fetchInvidiousVideo(videoId: string) {
  if (invidiousDisabled()) {
    throw new Error('Invidious API fallback is disabled.')
  }

  let lastError: Error | null = null

  for (const instance of invidiousInstances()) {
    try {
      const response = await fetch(`${instance}/api/v1/videos/${videoId}?local=true`, {
        headers: { 'User-Agent': 'HomesDrives-reels-maker/1.0' },
        signal: AbortSignal.timeout(25_000),
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

      return { instance, video, picked }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.warn(`[reels-maker/youtube/invidious] ${instance} failed:`, lastError.message)
    }
  }

  throw lastError ?? new Error('All Invidious API instances failed.')
}

function resolveFfmpegBinary() {
  const candidates = [
    process.env.FFMPEG_PATH,
    join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),
    join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
    'ffmpeg',
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    if (candidate === 'ffmpeg' || existsSync(candidate)) return candidate
  }

  return 'ffmpeg'
}

async function extractAudioFromMuxedVideo(videoBuffer: Buffer) {
  const workDir = await mkdtemp(join(tmpdir(), 'reels-invidious-'))
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
    if (!buffer.length) throw new Error('ffmpeg produced an empty audio file.')
    return buffer
  } finally {
    await safeRemoveDir(workDir)
  }
}

function thumbnailFor(video: InvidiousVideo, videoId: string) {
  const thumbs = video.videoThumbnails ?? []
  const best = thumbs.find((thumb) => thumb.quality === 'maxres') ?? thumbs[thumbs.length - 1]
  return best?.url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}

export async function downloadAudioViaInvidious(videoId: string) {
  const { video, picked } = await fetchInvidiousVideo(videoId)

  if (!picked.url) {
    throw new Error('Invidious did not return a proxied download URL.')
  }

  const response = await fetch(picked.url, {
    headers: { 'User-Agent': 'HomesDrives-reels-maker/1.0' },
    signal: AbortSignal.timeout(300_000),
  })

  if (!response.ok) {
    throw new Error(`Invidious stream download failed with HTTP ${response.status}.`)
  }

  let buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.length) {
    throw new Error('Invidious stream download returned an empty file.')
  }

  let extension = picked.muxed ? 'm4a' : picked.format.type?.includes('webm') ? 'webm' : 'm4a'
  let mimeType = extension === 'webm' ? 'audio/webm' : 'audio/mp4'

  if (picked.muxed) {
    console.info('[reels-maker/youtube/invidious] extracting audio from muxed stream via ffmpeg')
    buffer = await extractAudioFromMuxedVideo(buffer)
    extension = 'm4a'
    mimeType = 'audio/mp4'
  }

  return {
    buffer,
    extension,
    mimeType,
    title: video.title?.trim() || 'YouTube track',
    durationSeconds: typeof video.lengthSeconds === 'number' ? video.lengthSeconds : null,
    thumbnailUrl: thumbnailFor(video, videoId),
    channel: video.author?.trim() || 'YouTube',
  }
}
