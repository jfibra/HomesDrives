import { execFile } from 'child_process'
import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'

import { resolveFfmpegBinary } from '@/lib/reels-maker/audio-utils'
import { buildReelH264OutputArgs } from '@/lib/reels-maker/render-quality'
import { safeRemoveDir } from '@/lib/reels-maker/safe-rm'
import type { ReelLogoPosition } from '@/lib/reels-maker/types'

const execFileAsync = promisify(execFile)

/** Match outro logo scale (~50% of frame width). */
const LOGO_WIDTH_RATIO = 0.5
const LOGO_MARGIN = 36
/** Soft black plate behind the watermark so it reads on bright photos. */
const PLATE_OPACITY = 0.28
const PLATE_PAD_X_RATIO = 0.14
const PLATE_PAD_Y_RATIO = 0.22

function logoMaxWidth(frameWidth: number) {
  return Math.round(frameWidth * LOGO_WIDTH_RATIO)
}

function overlayCoords(position: ReelLogoPosition) {
  switch (position) {
    case 'top-left':
      return `${LOGO_MARGIN}:${LOGO_MARGIN}`
    case 'top-center':
      return `(main_w-overlay_w)/2:${LOGO_MARGIN}`
    case 'bottom-left':
      return `${LOGO_MARGIN}:main_h-overlay_h-${LOGO_MARGIN}`
    case 'bottom-center':
      return `(main_w-overlay_w)/2:main_h-overlay_h-${LOGO_MARGIN}`
    case 'bottom-right':
      return `main_w-overlay_w-${LOGO_MARGIN}:main_h-overlay_h-${LOGO_MARGIN}`
    case 'top-right':
    default:
      return `main_w-overlay_w-${LOGO_MARGIN}:${LOGO_MARGIN}`
  }
}

export type OverlayTimingOptions = {
  /** If set, overlay is visible only from this timestamp to the end of the video. */
  enableFromSeconds?: number | null
}

/** Resize logo and composite onto a low-opacity black rounded plate. */
async function prepareWatermarkLogoPng(logoBuffer: Buffer, frameWidth: number): Promise<Buffer> {
  const { default: sharp } = await import('sharp')
  const maxW = logoMaxWidth(frameWidth)
  const logoPng = await sharp(logoBuffer, { failOn: 'none' })
    .ensureAlpha()
    .resize({ width: maxW, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer()

  const meta = await sharp(logoPng).metadata()
  const lw = meta.width ?? maxW
  const lh = meta.height ?? Math.round(maxW * 0.35)
  const padX = Math.round(lw * PLATE_PAD_X_RATIO)
  const padY = Math.round(lh * PLATE_PAD_Y_RATIO)
  const plateW = lw + padX * 2
  const plateH = lh + padY * 2
  const radius = Math.round(Math.min(plateW, plateH) * 0.18)

  const plateSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${plateW}" height="${plateH}">
      <rect x="0" y="0" width="${plateW}" height="${plateH}" rx="${radius}" ry="${radius}"
        fill="black" fill-opacity="${PLATE_OPACITY}"/>
    </svg>`,
  )

  return sharp({
    create: {
      width: plateW,
      height: plateH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: await sharp(plateSvg).png().toBuffer(), left: 0, top: 0 },
      { input: logoPng, left: padX, top: padY },
    ])
    .png()
    .toBuffer()
}

export async function applyLogoOverlayToVideo(
  videoBuffer: Buffer,
  logoBuffer: Buffer,
  logoFileName: string,
  position: ReelLogoPosition,
  frameWidth = 1080,
  timing?: OverlayTimingOptions,
): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), 'reels-logo-'))
  const videoPath = join(workDir, 'input.mp4')
  const logoPath = join(workDir, 'logo-watermark.png')
  const outputPath = join(workDir, 'branded.mp4')
  const ffmpeg = await resolveFfmpegBinary()
  const coords = overlayCoords(position)
  const enableFrom = timing?.enableFromSeconds
  const enableExpr =
    typeof enableFrom === 'number' && Number.isFinite(enableFrom) && enableFrom > 0
      ? `:enable='gte(t\\,${enableFrom.toFixed(3)})'`
      : ''
  // Plate + logo already sized — overlay as-is
  const filter = `[1:v]format=rgba[lg];[0:v][lg]overlay=${coords}${enableExpr}`

  try {
    await writeFile(videoPath, videoBuffer)
    void logoFileName
    const prepared = await prepareWatermarkLogoPng(logoBuffer, frameWidth)
    await writeFile(logoPath, prepared)

    await execFileAsync(
      ffmpeg,
      [
        '-y',
        '-i',
        videoPath,
        '-i',
        logoPath,
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
