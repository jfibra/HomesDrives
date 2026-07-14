import { execFile } from 'child_process'
import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { extname } from 'path'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'

import { resolveFfmpegBinary } from '@/lib/reels-maker/audio-utils'
import { buildReelH264OutputArgs } from '@/lib/reels-maker/render-quality'
import { safeRemoveDir } from '@/lib/reels-maker/safe-rm'
import type { ReelLogoPosition } from '@/lib/reels-maker/types'

const execFileAsync = promisify(execFile)

const QR_WIDTH_RATIO = 0.22
const QR_MARGIN = 32
const QR_BOX_PADDING = 18

function qrMaxWidth(frameWidth: number) {
  return Math.round(frameWidth * QR_WIDTH_RATIO)
}

function overlayCoords(position: ReelLogoPosition) {
  switch (position) {
    case 'top-left':
      return `${QR_MARGIN}:${QR_MARGIN}`
    case 'top-center':
      return `(main_w-overlay_w)/2:${QR_MARGIN}`
    case 'top-right':
      return `main_w-overlay_w-${QR_MARGIN}:${QR_MARGIN}`
    case 'bottom-left':
      return `${QR_MARGIN}:main_h-overlay_h-${QR_MARGIN}`
    case 'bottom-center':
      return `(main_w-overlay_w)/2:main_h-overlay_h-${QR_MARGIN}`
    case 'bottom-right':
    default:
      return `main_w-overlay_w-${QR_MARGIN}:main_h-overlay_h-${QR_MARGIN}`
  }
}

export type QrOverlayTimingOptions = {
  /** If set, overlay is visible only from this timestamp to the end of the video. */
  enableFromSeconds?: number | null
}

/** Overlays a QR code image onto the video inside a white box container so it stays scannable against busy footage. */
export async function applyQrOverlayToVideo(
  videoBuffer: Buffer,
  qrBuffer: Buffer,
  qrFileName: string,
  position: ReelLogoPosition,
  frameWidth = 1080,
  timing?: QrOverlayTimingOptions,
): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), 'reels-qr-'))
  const videoPath = join(workDir, 'input.mp4')
  const ext = extname(qrFileName).toLowerCase() || '.png'
  const qrPath = join(workDir, `qr${ext}`)
  const outputPath = join(workDir, 'branded.mp4')
  const ffmpeg = await resolveFfmpegBinary()
  const coords = overlayCoords(position)
  const enableFrom = timing?.enableFromSeconds
  const enableExpr =
    typeof enableFrom === 'number' && Number.isFinite(enableFrom) && enableFrom > 0
      ? `:enable='gte(t\\,${enableFrom.toFixed(3)})'`
      : ''
  const filter =
    `[1:v]scale='min(${qrMaxWidth(frameWidth)}\\,iw)':-1[qrs];` +
    `[qrs]pad=iw+${QR_BOX_PADDING * 2}:ih+${QR_BOX_PADDING * 2}:${QR_BOX_PADDING}:${QR_BOX_PADDING}:white[qrbox];` +
    `[0:v][qrbox]overlay=${coords}${enableExpr}`

  try {
    await writeFile(videoPath, videoBuffer)
    await writeFile(qrPath, qrBuffer)

    await execFileAsync(
      ffmpeg,
      [
        '-y',
        '-i',
        videoPath,
        '-i',
        qrPath,
        '-filter_complex',
        filter,
        ...buildReelH264OutputArgs(),
        '-an',
        '-movflags',
        '+faststart',
        outputPath,
      ],
      { maxBuffer: 1024 * 1024 * 64, timeout: 120_000, killSignal: 'SIGKILL' },
    )

    return readFile(outputPath)
  } finally {
    await safeRemoveDir(workDir)
  }
}
