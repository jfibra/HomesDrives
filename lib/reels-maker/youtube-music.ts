import { execFile, execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { mkdtemp, readFile, readdir } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { promisify } from 'util'

import { normalizeYouTubeUrl, parseYouTubeVideoId } from '@/lib/reels-maker/youtube-url'
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

/** Fallback strategies when YouTube returns 403 for default formats. */
const YOUTUBE_DOWNLOAD_STRATEGIES: Array<{ label: string; flags: string[]; format: string }> = [
  {
    label: 'web_safari',
    flags: ['--extractor-args', 'youtube:player_client=default,web_safari;player_js_version=actual'],
    format: 'bestaudio/best',
  },
  {
    label: 'no_android_sdkless',
    flags: ['--extractor-args', 'youtube:player_client=default,-android_sdkless'],
    format: 'bestaudio/best',
  },
  {
    label: 'ios_m3u8',
    flags: [
      '--extractor-args',
      'youtube:player_client=default,ios,-android_sdkless;formats=missing_pot',
    ],
    format: 'ba[protocol=m3u8_native]/bestaudio/best',
  },
  {
    label: 'android_vr',
    flags: ['--extractor-args', 'youtube:player_client=android_vr,web'],
    format: 'bestaudio/best',
  },
  {
    label: 'default',
    flags: [],
    format: 'bestaudio/best',
  },
]

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

function detectJsRuntimeFlag() {
  const configured = process.env.YT_DLP_JS_RUNTIMES?.trim()
  if (configured) return ['--js-runtimes', configured]

  const nodeBin = process.execPath
  if (nodeBin && existsSync(nodeBin)) {
    return ['--js-runtimes', `node:${nodeBin}`]
  }

  return []
}

function buildYtDlpFlags(extra: string[] = []) {
  const flags = [...BASE_YT_DLP_FLAGS, ...detectJsRuntimeFlag(), ...extra]
  const ffmpegLocation = resolveFfmpegLocation()
  if (ffmpegLocation) {
    flags.push('--ffmpeg-location', ffmpegLocation)
  }

  const cookiesFile = process.env.YT_DLP_COOKIES_FILE?.trim()
  if (cookiesFile && existsSync(cookiesFile)) {
    flags.push('--cookies', cookiesFile)
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
      'YouTube blocked this server (bot check). Upload an MP3 instead, or ask your admin to add ' +
      'YT_DLP_COOKIES_FILE on EC2 with exported YouTube login cookies.'
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
  return /403|forbidden|unable to download|sign in|not a bot|confirm you|cookies/i.test(message)
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
  const stdout = await runYtDlpWithStrategies(url, YOUTUBE_JSON_STRATEGIES, () => [
    '--dump-single-json',
    '--skip-download',
  ])
  return JSON.parse(stdout) as YouTubeJson
}

export async function getYouTubeTrackPreview(rawUrl: string): Promise<YouTubeTrackPreview> {
  const videoId = parseYouTubeVideoId(rawUrl)
  const url = normalizeYouTubeUrl(rawUrl)
  if (!videoId || !url) {
    throw new Error('Paste a valid YouTube link (watch, Shorts, or youtu.be).')
  }

  const info = await fetchYouTubeJson(url)
  const thumbnailUrl = info.thumbnail ?? info.thumbnails?.[info.thumbnails.length - 1]?.url ?? null

  return {
    videoId,
    title: info.title?.trim() || 'YouTube track',
    durationSeconds: typeof info.duration === 'number' ? info.duration : null,
    thumbnailUrl,
    channel: info.channel?.trim() || info.uploader?.trim() || null,
  }
}

async function downloadWithStrategy(
  url: string,
  workDir: string,
  strategy: (typeof YOUTUBE_DOWNLOAD_STRATEGIES)[number],
) {
  const outputBase = join(workDir, 'track')
  await runYtDlp(
    url,
    buildYtDlpFlags([
      ...strategy.flags,
      '-f',
      strategy.format,
      '--output',
      `${outputBase}.%(ext)s`,
    ]),
  )
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
    for (const strategy of YOUTUBE_DOWNLOAD_STRATEGIES) {
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
