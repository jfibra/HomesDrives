import { execFile, execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { mkdtemp, readFile, readdir } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { promisify } from 'util'

import { normalizeYouTubeUrl, parseYouTubeVideoId } from '@/lib/reels-maker/youtube-url'
import { downloadAudioViaInvidious } from '@/lib/reels-maker/youtube-invidious'
import { downloadAudioViaPiped, fetchPipedStreams } from '@/lib/reels-maker/youtube-piped'
import { safeRemoveDir } from '@/lib/reels-maker/safe-rm'

const execFileAsync = promisify(execFile)

export type YouTubeTrackPreview = {
  videoId: string
  title: string
  durationSeconds: number | null
  thumbnailUrl: string | null
  channel: string | null
}

type YouTubeJson = {
  title?: string
  duration?: number
  thumbnail?: string
  thumbnails?: Array<{ url?: string }>
  channel?: string
  uploader?: string
}

const BASE_YT_DLP_FLAGS = ['--no-warnings', '--no-check-certificates', '--no-playlist']

/** Prefer DASH/https audio only — never fall back to HLS (m3u8 403s on EC2). */
const PREFER_DASH_AUDIO_FORMAT =
  'bestaudio[protocol=https]/bestaudio[protocol=http_dash_segments]/bestaudio[ext=m4a][protocol!=m3u8]/bestaudio[ext=webm][protocol!=m3u8]/bestaudio[acodec^=mp4a][protocol!=m3u8]/bestaudio[protocol!=m3u8_native][protocol!=m3u8]'

/** Extract audio from a progressive/DASH mux when no bare audio stream exists. */
const EXTRACT_AUDIO_FROM_MUXED_FORMAT =
  'best[protocol=https]/best[protocol=http_dash_segments]/bestvideo[ext=mp4][protocol!=m3u8]+bestaudio[protocol!=m3u8]/best[protocol!=m3u8_native][protocol!=m3u8]'

type YouTubeDownloadStrategy = {
  label: string
  flags: string[]
  format: string
  /** When true, extract audio from a combined video+audio stream via ffmpeg. */
  extractAudio?: boolean
}

function resolvePotBaseUrl(): string | null {
  const baseUrl = process.env.YT_DLP_POT_BASE_URL?.trim()
  if (baseUrl) return baseUrl

  const enabled = process.env.YT_DLP_POT_ENABLED?.trim()
  if (enabled && /^(1|true|yes|on)$/i.test(enabled)) {
    return 'http://127.0.0.1:4416'
  }

  return null
}

function youtubeExtractorArgs(...parts: string[]) {
  return ['--extractor-args', parts.join(';')]
}

/** bgutil POT provider args when the HTTP server is not on the default port. */
function potProviderArgs(): string[] {
  const baseUrl = resolvePotBaseUrl()
  if (!baseUrl || baseUrl === 'http://127.0.0.1:4416') {
    return []
  }

  return youtubeExtractorArgs(`youtubepot-bgutilhttp:base_url=${baseUrl}`)
}

const MWEB_POT_STRATEGY: YouTubeDownloadStrategy = {
  label: 'mweb_pot',
  flags: [
    ...youtubeExtractorArgs('youtube:player_client=default,mweb', 'player_js_version=actual'),
    ...potProviderArgs(),
  ],
  format: PREFER_DASH_AUDIO_FORMAT,
}

/** Format 18 progressive https with mweb + POT — needed for GVS on EC2. */
const FORMAT_18_MWEB_POT: YouTubeDownloadStrategy = {
  label: 'format_18_mweb_pot',
  flags: [
    ...youtubeExtractorArgs('youtube:player_client=default,mweb', 'player_js_version=actual'),
    ...potProviderArgs(),
  ],
  format: '18/best[protocol=https]',
  extractAudio: true,
}

/** Single-file progressive https (e.g. format 18) — extract audio via ffmpeg. */
const PROGRESSIVE_HTTPS_EXTRACT: YouTubeDownloadStrategy = {
  label: 'progressive_https_extract',
  flags: [
    ...youtubeExtractorArgs('youtube:player_client=default,mweb', 'player_js_version=actual'),
    ...potProviderArgs(),
  ],
  format: 'best[protocol=https]/18/bestvideo[ext=mp4][protocol=https]+bestaudio[protocol!=m3u8]',
  extractAudio: true,
}

/** Fallback strategies when YouTube blocks formats or returns none for a selector. */
const YOUTUBE_DOWNLOAD_STRATEGIES: YouTubeDownloadStrategy[] = [
  {
    label: 'web_safari',
    flags: ['--extractor-args', 'youtube:player_client=default,web_safari;player_js_version=actual'],
    format: PREFER_DASH_AUDIO_FORMAT,
  },
  {
    label: 'tv_embedded',
    flags: ['--extractor-args', 'youtube:player_client=tv_embedded,web'],
    format: PREFER_DASH_AUDIO_FORMAT,
  },
  {
    label: 'no_android_sdkless',
    flags: ['--extractor-args', 'youtube:player_client=default,-android_sdkless'],
    format: PREFER_DASH_AUDIO_FORMAT,
  },
  {
    label: 'android_vr',
    flags: ['--extractor-args', 'youtube:player_client=android_vr,web'],
    format: PREFER_DASH_AUDIO_FORMAT,
  },
  {
    label: 'best_extract_audio',
    flags: [],
    format: EXTRACT_AUDIO_FROM_MUXED_FORMAT,
    extractAudio: true,
  },
  {
    label: 'default',
    flags: [],
    format: PREFER_DASH_AUDIO_FORMAT,
  },
]

const MWEB_POT_JSON_STRATEGY = {
  label: 'mweb_pot',
  flags: [
    ...youtubeExtractorArgs('youtube:player_client=default,mweb', 'player_js_version=actual'),
    ...potProviderArgs(),
  ],
}

const YOUTUBE_JSON_STRATEGIES: Array<{ label: string; flags: string[] }> = [
  {
    label: 'web_safari',
    flags: ['--extractor-args', 'youtube:player_client=default,web_safari;player_js_version=actual'],
  },
  {
    label: 'no_android_sdkless',
    flags: ['--extractor-args', 'youtube:player_client=default,-android_sdkless'],
  },
  { label: 'default', flags: [] },
]

function youtubeJsonStrategies() {
  const strategies = [...YOUTUBE_JSON_STRATEGIES]
  if (resolvePotBaseUrl()) {
    strategies.unshift(MWEB_POT_JSON_STRATEGY)
  }
  if (resolveCookiesFile()) {
    return strategies
  }
  return strategies
}

function youtubeDownloadStrategies() {
  const strategies = [...YOUTUBE_DOWNLOAD_STRATEGIES]
  const hasCookies = Boolean(resolveCookiesFile())
  const hasPot = Boolean(resolvePotBaseUrl())

  if (hasPot) {
    strategies.unshift(MWEB_POT_STRATEGY)
  }

  if (hasCookies) {
    const cookieStrategies: YouTubeDownloadStrategy[] = [
      FORMAT_18_MWEB_POT,
      PROGRESSIVE_HTTPS_EXTRACT,
      {
        label: 'mweb_cookies_pot',
        flags: [
          ...youtubeExtractorArgs('youtube:player_client=default,mweb', 'player_js_version=actual'),
          ...potProviderArgs(),
        ],
        format: PREFER_DASH_AUDIO_FORMAT,
      },
      {
        label: 'web_cookies',
        flags: ['--extractor-args', 'youtube:player_client=default,web;player_js_version=actual'],
        format: PREFER_DASH_AUDIO_FORMAT,
      },
      {
        label: 'web_safari_cookies',
        flags: ['--extractor-args', 'youtube:player_client=default,web_safari;player_js_version=actual'],
        format: PREFER_DASH_AUDIO_FORMAT,
      },
    ]

    const withoutDupes = strategies.filter(
      (s) => !['web_safari', 'mweb_pot', 'best_extract_audio'].includes(s.label),
    )
    return [...cookieStrategies, ...withoutDupes]
  }

  return strategies
}

function shouldSkipCookies() {
  return /^(1|true|yes|on)$/i.test(process.env.YT_DLP_SKIP_COOKIES?.trim() || '')
}

function resolveCookiesFile(): string | null {
  const configured = process.env.YT_DLP_COOKIES_FILE?.trim()
  if (configured && existsSync(configured)) {
    return configured
  }

  const defaultPath = join(process.cwd(), '.data', 'youtube-cookies.txt')
  if (!shouldSkipCookies() && existsSync(defaultPath)) {
    return defaultPath
  }

  return configured || null
}

function detectProxyFlag(): string[] {
  const proxy = process.env.YT_DLP_PROXY?.trim()
  if (!proxy) return []
  return ['--proxy', proxy]
}

function resolveYtDlpBinary() {
  const bundledUnix = join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp')
  const bundledWin = join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp.exe')
  const candidates = [
    process.env.YT_DLP_PATH,
    process.env.YOUTUBE_DL_PATH,
    bundledUnix,
    bundledWin,
  ].filter((value): value is string => Boolean(value?.trim()))

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  for (const name of ['yt-dlp', 'youtube-dl']) {
    try {
      const whichCmd = process.platform === 'win32' ? 'where' : 'which'
      const resolved = execFileSync(whichCmd, [name], { encoding: 'utf8' })
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)
      if (resolved && existsSync(resolved)) {
        return resolved
      }
    } catch {
      // not on PATH
    }
  }

  throw new Error(
    'yt-dlp was not found. On EC2 run: node node_modules/youtube-dl-exec/scripts/postinstall.js ' +
      'then set YT_DLP_PATH in .env, or install system yt-dlp (curl to /usr/local/bin/yt-dlp).',
  )
}

function resolveFfmpegLocation() {
  const candidates = [
    process.env.FFMPEG_PATH,
    join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
    join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return dirname(candidate)
    }
  }

  return null
}

function resolveJsRuntime(): string {
  const configured = process.env.YT_DLP_JS_RUNTIMES?.trim()
  if (configured) return configured

  const home = process.env.HOME || '/root'
  const denoCandidates = [
    join(home, '.deno', 'bin', 'deno'),
    '/usr/local/bin/deno',
  ]

  for (const deno of denoCandidates) {
    if (existsSync(deno)) {
      return `deno:${deno}`
    }
  }

  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which'
    const resolved = execFileSync(whichCmd, ['deno'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
    if (resolved && existsSync(resolved)) {
      return `deno:${resolved}`
    }
  } catch {
    // deno not on PATH
  }

  // Node 22+ works; Node 20 (common on nvm) cannot solve YouTube EJS challenges.
  const nodeBin = process.execPath
  if (nodeBin && existsSync(nodeBin)) {
    return `node:${nodeBin}`
  }

  return ''
}

function detectJsRuntimeFlag() {
  const runtime = resolveJsRuntime()
  if (!runtime) return []
  return ['--js-runtimes', runtime]
}

/** YouTube signature/n-challenge scripts (yt-dlp-ejs). Required on many 2026+ videos. */
function detectRemoteComponentsFlag() {
  const configured = process.env.YT_DLP_REMOTE_COMPONENTS?.trim()
  if (configured && /^(none|off|false|0)$/i.test(configured)) {
    return []
  }

  return ['--remote-components', configured || 'ejs:github']
}

function buildYtDlpFlags(extra: string[] = []) {
  const flags = [
    ...BASE_YT_DLP_FLAGS,
    ...detectJsRuntimeFlag(),
    ...detectRemoteComponentsFlag(),
    ...detectProxyFlag(),
    ...extra,
  ]
  const ffmpegLocation = resolveFfmpegLocation()
  if (ffmpegLocation) {
    flags.push('--ffmpeg-location', ffmpegLocation)
  }

  if (!shouldSkipCookies()) {
    const cookiesFile = resolveCookiesFile()
    if (cookiesFile) {
      flags.push('--cookies', cookiesFile)
    }
  }

  const cookiesBrowser = process.env.YT_DLP_COOKIES_BROWSER?.trim()
  if (cookiesBrowser) {
    flags.push('--cookies-from-browser', cookiesBrowser)
  }

  return flags
}

function mimeTypeForAudioFile(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase()
  switch (extension) {
    case 'm4a':
      return 'audio/mp4'
    case 'webm':
      return 'audio/webm'
    case 'opus':
      return 'audio/opus'
    case 'ogg':
      return 'audio/ogg'
    case 'mp3':
    default:
      return 'audio/mpeg'
  }
}

function normalizeYtDlpError(error: unknown) {
  const execError = error as { stderr?: string; message?: string }
  const detail = (execError.stderr?.trim() || execError.message || 'yt-dlp failed.')
    .replace(/^Deprecated Feature:[\s\S]*?\n\n/, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join(' ')

  if (/403|forbidden/i.test(detail)) {
    return (
      'YouTube blocked the music download (403). Try another link, upload an MP3 file instead, ' +
      'or set YT_DLP_COOKIES_FILE in .env with exported YouTube cookies.'
    )
  }

  if (/sign in|not a bot|confirm you/i.test(detail)) {
    return (
      'YouTube blocked this server (bot check). Export fresh youtube.com-only cookies and upload to EC2 ' +
      '(see services/reels-api/README.md), or set YT_DLP_PROXY to a residential proxy. Or upload an MP3 instead.'
    )
  }

  if (/cookies are no longer valid|likely been rotated/i.test(detail)) {
    return (
      'YouTube cookies on the server are expired. Re-export fresh youtube.com-only cookies and upload to EC2, ' +
      'or remove YT_DLP_COOKIES_FILE from .env for public videos.'
    )
  }

  if (/downloaded file is empty|fragment not found/i.test(detail)) {
    return (
      'YouTube audio download failed (stream blocked). Try without expired cookies, use another link, or upload an MP3.'
    )
  }

  if (/signature solving|challenge solving|only images are available|ejs/i.test(detail)) {
    return (
      'YouTube challenge solving failed on the server. Install Deno on EC2 (recommended) or Node 22+, ' +
      'set YT_DLP_JS_RUNTIMES=deno:/root/.deno/bin/deno in .env, then restart reels-api.'
    )
  }

  return detail || 'YouTube download failed.'
}

async function runYtDlp(url: string, flags: string[]) {
  const binary = resolveYtDlpBinary()
  try {
    const { stdout } = await execFileAsync(binary, [url, ...flags], {
      maxBuffer: 1024 * 1024 * 32,
      windowsHide: true,
    })
    return stdout
  } catch (error) {
    throw new Error(normalizeYtDlpError(error))
  }
}

function isRetryableYouTubeError(message: string) {
  return /403|forbidden|unable to download|sign in|not a bot|confirm you|cookies|format is not available|requested format|no video formats|only images are available|signature solving|challenge solving|ejs|downloaded file is empty|fragment not found/i.test(
    message,
  )
}

async function runYtDlpWithStrategies(
  url: string,
  strategies: Array<{ label: string; flags: string[] }>,
  buildCommandFlags: (strategyFlags: string[]) => string[],
) {
  let lastError: Error | null = null

  for (const strategy of strategies) {
    try {
      return await runYtDlp(url, buildYtDlpFlags([...strategy.flags, ...buildCommandFlags(strategy.flags)]))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      lastError = error instanceof Error ? error : new Error(message)
      console.warn(`[reels-maker/youtube] strategy "${strategy.label}" failed:`, message)
      if (!isRetryableYouTubeError(message)) {
        throw lastError
      }
    }
  }

  throw lastError ?? new Error('YouTube download failed.')
}

async function fetchYouTubeJson(url: string) {
  const stdout = await runYtDlpWithStrategies(url, youtubeJsonStrategies(), () => [
    '--dump-single-json',
    '--skip-download',
  ])
  return JSON.parse(stdout) as YouTubeJson
}

async function fetchYouTubeOEmbedPreview(videoId: string, url: string): Promise<YouTubeTrackPreview> {
  const response = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    { signal: AbortSignal.timeout(15_000) },
  )

  if (!response.ok) {
    throw new Error(`YouTube oEmbed returned HTTP ${response.status}.`)
  }

  const data = (await response.json()) as {
    title?: string
    author_name?: string
    thumbnail_url?: string
  }

  return {
    videoId,
    title: data.title?.trim() || 'YouTube track',
    durationSeconds: null,
    thumbnailUrl: data.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    channel: data.author_name?.trim() || 'YouTube',
  }
}

export async function getYouTubeTrackPreview(rawUrl: string): Promise<YouTubeTrackPreview> {
  const videoId = parseYouTubeVideoId(rawUrl)
  const url = normalizeYouTubeUrl(rawUrl)
  if (!videoId || !url) {
    throw new Error('Paste a valid YouTube link (watch, Shorts, or youtu.be).')
  }

  try {
    const info = await fetchYouTubeJson(url)
    const thumbnailUrl = info.thumbnail ?? info.thumbnails?.[info.thumbnails.length - 1]?.url ?? null

    return {
      videoId,
      title: info.title?.trim() || 'YouTube track',
      durationSeconds: typeof info.duration === 'number' ? info.duration : null,
      thumbnailUrl,
      channel: info.channel?.trim() || info.uploader?.trim() || null,
    }
  } catch (ytDlpError) {
    console.warn('[reels-maker/youtube] preview via yt-dlp failed, trying Piped:', ytDlpError)
    try {
      const piped = await fetchPipedStreams(videoId)
      return {
        videoId,
        title: piped.title?.trim() || 'YouTube track',
        durationSeconds: typeof piped.duration === 'number' ? piped.duration : null,
        thumbnailUrl: piped.thumbnailUrl ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        channel: piped.uploader?.trim() || 'YouTube',
      }
    } catch (pipedError) {
      console.warn('[reels-maker/youtube] preview via Piped failed, trying oEmbed:', pipedError)
      return fetchYouTubeOEmbedPreview(videoId, url)
    }
  }
}

async function downloadWithStrategy(
  url: string,
  workDir: string,
  strategy: YouTubeDownloadStrategy,
) {
  const outputBase = join(workDir, 'track')
  const commandFlags = [
    ...strategy.flags,
    '-f',
    strategy.format,
    '--output',
    `${outputBase}.%(ext)s`,
  ]

  if (strategy.extractAudio) {
    commandFlags.push('--extract-audio', '--audio-format', 'm4a', '--audio-quality', '0')
  }

  await runYtDlp(url, buildYtDlpFlags(commandFlags))
}

export async function downloadYouTubeAudio(rawUrl: string) {
  const url = normalizeYouTubeUrl(rawUrl)
  const videoId = parseYouTubeVideoId(rawUrl)
  if (!url) {
    throw new Error('Paste a valid YouTube link (watch, Shorts, or youtu.be).')
  }

  const workDir = await mkdtemp(join(tmpdir(), 'reels-yt-'))
  let lastError: Error | null = null

  try {
    for (const strategy of youtubeDownloadStrategies()) {
      try {
        await downloadWithStrategy(url, workDir, strategy)

        const files = await readdir(workDir)
        const audioFile = files.find((name) => /\.(mp3|m4a|opus|webm|ogg|aac)$/i.test(name))
        if (!audioFile) {
          throw new Error('Could not extract audio from that YouTube link.')
        }

        const buffer = await readFile(join(workDir, audioFile))
        const extension = audioFile.split('.').pop()?.toLowerCase() || 'm4a'

        console.info(`[reels-maker/youtube] downloaded audio using strategy "${strategy.label}"`)

        return {
          buffer,
          fileName: `youtube-${videoId ?? 'track'}.${extension}`,
          mimeType: mimeTypeForAudioFile(audioFile),
          preview: {
            videoId: videoId ?? 'unknown',
            title: 'YouTube track',
            durationSeconds: null,
            thumbnailUrl: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null,
            channel: 'YouTube',
          },
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        const message = lastError.message
        console.warn(`[reels-maker/youtube] download strategy "${strategy.label}" failed:`, message)
        if (!isRetryableYouTubeError(message)) {
          throw lastError
        }
      }
    }

    throw lastError ?? new Error('YouTube download failed.')
  } catch (ytDlpFailure) {
    if (!videoId) {
      throw ytDlpFailure
    }

    console.warn('[reels-maker/youtube] yt-dlp failed, trying Piped API fallback:', ytDlpFailure)

    try {
      const piped = await downloadAudioViaPiped(videoId)
      console.info('[reels-maker/youtube] downloaded audio using Piped API fallback')

      return {
        buffer: piped.buffer,
        fileName: `youtube-${videoId}.${piped.extension}`,
        mimeType: piped.mimeType,
        preview: {
          videoId,
          title: piped.title,
          durationSeconds: piped.durationSeconds,
          thumbnailUrl: piped.thumbnailUrl,
          channel: piped.channel,
        },
      }
    } catch (pipedError) {
      console.warn('[reels-maker/youtube] Piped failed, trying Invidious fallback:', pipedError)

      try {
        const invidious = await downloadAudioViaInvidious(videoId)
        console.info('[reels-maker/youtube] downloaded audio using Invidious API fallback')

        return {
          buffer: invidious.buffer,
          fileName: `youtube-${videoId}.${invidious.extension}`,
          mimeType: invidious.mimeType,
          preview: {
            videoId,
            title: invidious.title,
            durationSeconds: invidious.durationSeconds,
            thumbnailUrl: invidious.thumbnailUrl,
            channel: invidious.channel,
          },
        }
      } catch (invidiousError) {
        const pipedMessage = pipedError instanceof Error ? pipedError.message : String(pipedError)
        const invidiousMessage =
          invidiousError instanceof Error ? invidiousError.message : String(invidiousError)
        const ytMessage = ytDlpFailure instanceof Error ? ytDlpFailure.message : String(ytDlpFailure)
        throw new Error(
          `YouTube download is blocked on this server (AWS IP). Upload an MP3 instead, or set YT_DLP_PROXY to a residential proxy. Details: ${invidiousMessage}`,
        )
      }
    }
  } finally {
    await safeRemoveDir(workDir)
  }
}

/** Best-effort check that yt-dlp can reach YouTube metadata APIs. */
export function probeYtDlpBinary() {
  const binary = resolveYtDlpBinary()
  try {
    execFileSync(binary, ['--version'], { windowsHide: true })
    return binary
  } catch {
    throw new Error('yt-dlp binary is not executable.')
  }
}
