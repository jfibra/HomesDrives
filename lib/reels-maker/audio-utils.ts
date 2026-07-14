import { readFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'

import { buildReelH264OutputArgs } from '@/lib/reels-maker/render-quality'

const execFileAsync = promisify(execFile)

export const VOICE_FADE_IN_SEC = 0.4
export const VOICE_FADE_OUT_SEC = 0.85
export const VOICE_TAIL_PAD_SEC = 0.25
/** Brief music-only tail after narration ends before the reel cuts. */
export const REEL_END_PAD_SEC = 0.45

export async function resolveFfmpegBinary() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH
  try {
    const ffmpegStatic = await import('ffmpeg-static')
    if (ffmpegStatic.default) return ffmpegStatic.default
  } catch {
    // optional
  }
  return 'ffmpeg'
}

function parseDurationFromFfmpegOutput(output: string) {
  const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!match) return 0

  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  return hours * 3600 + minutes * 60 + seconds
}

export function probeWavDurationFromBuffer(buffer: Buffer) {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') return 0

  const channels = buffer.readUInt16LE(22)
  const sampleRate = buffer.readUInt32LE(24)
  const bitsPerSample = buffer.readUInt16LE(34)
  const dataSize = buffer.readUInt32LE(40)

  if (!sampleRate || !channels || !bitsPerSample) return 0
  return dataSize / (sampleRate * channels * (bitsPerSample / 8))
}

export async function probeMediaDuration(filePath: string): Promise<number> {
  const binary = await resolveFfmpegBinary()
  if (!binary) return 0

  let output = ''
  try {
    const result = await execFileAsync(binary, ['-hide_banner', '-i', filePath], {
      maxBuffer: 1024 * 1024 * 8,
    })
    output = `${result.stderr ?? ''}\n${result.stdout ?? ''}`
  } catch (error) {
    output =
      error && typeof error === 'object' && 'stderr' in error
        ? String((error as { stderr?: Buffer | string }).stderr ?? '')
        : ''
  }

  const parsed = parseDurationFromFfmpegOutput(output)
  if (parsed > 0) return parsed

  if (filePath.toLowerCase().endsWith('.wav')) {
    try {
      const buffer = await readFile(filePath)
      return probeWavDurationFromBuffer(buffer)
    } catch {
      return 0
    }
  }

  return 0
}

export async function runFfmpegAudio(args: string[]) {
  const binary = await resolveFfmpegBinary()
  if (!binary) {
    throw new Error('FFmpeg binary not found.')
  }
  await execFileAsync(binary, args, {
    maxBuffer: 1024 * 1024 * 64,
    timeout: 120_000,
    killSignal: 'SIGKILL',
  })
}

export async function measureVoiceOverDuration(voiceBuffer: Buffer) {
  const raw = probeWavDurationFromBuffer(voiceBuffer)
  return raw > 0 ? raw : 0
}

export async function processVoiceTrackForMix(voicePath: string, outputPath: string) {
  const rawDuration = await probeMediaDuration(voicePath)
  const fadeOutStart = Math.max(
    VOICE_FADE_IN_SEC + 0.25,
    rawDuration > 0 ? rawDuration - VOICE_FADE_OUT_SEC : VOICE_FADE_IN_SEC + 0.25,
  )

  await runFfmpegAudio([
    '-y',
    '-i',
    voicePath,
    '-af',
    [
      `afade=t=in:st=0:d=${VOICE_FADE_IN_SEC}`,
      `afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${VOICE_FADE_OUT_SEC}`,
      `apad=pad_dur=${VOICE_TAIL_PAD_SEC}`,
    ].join(','),
    outputPath,
  ])

  const duration = await probeMediaDuration(outputPath)
  if (duration > 0) return { duration }
  if (rawDuration > 0) return { duration: rawDuration + VOICE_TAIL_PAD_SEC }
  return { duration: 0 }
}

export async function processMusicTrackForMix(
  musicPath: string,
  outputPath: string,
  targetDuration: number,
) {
  const fadeOutStart = Math.max(0.5, targetDuration - 1.8)
  await runFfmpegAudio([
    '-y',
    '-stream_loop',
    '-1',
    '-i',
    musicPath,
    '-af',
    [
      'volume=0.28',
      'afade=t=in:st=0:d=0.8',
      `atrim=0:${targetDuration.toFixed(3)}`,
      `afade=t=out:st=${fadeOutStart.toFixed(3)}:d=1.6`,
    ].join(','),
    '-t',
    targetDuration.toFixed(3),
    outputPath,
  ])
}

export async function trimVideoToDuration(
  inputPath: string,
  outputPath: string,
  targetDuration: number,
) {
  await runFfmpegAudio([
    '-y',
    '-i',
    inputPath,
    '-t',
    targetDuration.toFixed(3),
    ...buildReelH264OutputArgs(),
    '-an',
    outputPath,
  ])
  return probeMediaDuration(outputPath)
}

export async function padVideoToDuration(
  inputPath: string,
  outputPath: string,
  targetDuration: number,
) {
  const currentDuration = await probeMediaDuration(inputPath)
  if (currentDuration >= targetDuration - 0.05) {
    return currentDuration
  }

  const padSeconds = targetDuration - currentDuration
  await runFfmpegAudio([
    '-y',
    '-i',
    inputPath,
    '-vf',
    `tpad=stop_mode=clone:stop_duration=${padSeconds.toFixed(3)}`,
    '-an',
    ...buildReelH264OutputArgs(),
    '-t',
    targetDuration.toFixed(3),
    outputPath,
  ])

  return probeMediaDuration(outputPath)
}
