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

/** Portrait reels: large watermark (~50% width). Landscape/YouTube: compact (~20%). */
const LOGO_WIDTH_RATIO_PORTRAIT = 0.5
const LOGO_WIDTH_RATIO_LANDSCAPE = 0.2
const LOGO_MARGIN = 28
/** Soft plate behind the watermark. */
const PLATE_OPACITY = 0.1
const PLATE_PAD_Y_RATIO = 0.32

function isLandscapeFrame(frameWidth: number, frameHeight?: number) {
  return typeof frameHeight === 'number' && frameHeight > 0 ? frameWidth > frameHeight : frameWidth >= 1600
}

function logoMaxWidth(frameWidth: number, frameHeight?: number) {
  const ratio = isLandscapeFrame(frameWidth, frameHeight)
    ? LOGO_WIDTH_RATIO_LANDSCAPE
    : LOGO_WIDTH_RATIO_PORTRAIT
  return Math.round(frameWidth * ratio)
}

function overlayCoords(position: ReelLogoPosition, fullWidthPlate: boolean) {
  if (fullWidthPlate) {
    switch (position) {
      case 'bottom-left':
      case 'bottom-center':
      case 'bottom-right':
        return `0:main_h-overlay_h`
      default:
        return `0:0`
    }
  }
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
  /** If set, overlay is visible only while t is strictly before this timestamp. */
  enableUntilSeconds?: number | null
}

/** Resize logo and composite onto a soft black plate (full-width on portrait, tight on landscape). */
async function prepareWatermarkLogoPng(
  logoBuffer: Buffer,
  frameWidth: number,
  frameHeight?: number,
): Promise<{ png: Buffer; fullWidthPlate: boolean }> {
  const { default: sharp } = await import('sharp')
  const landscape = isLandscapeFrame(frameWidth, frameHeight)
  const maxW = logoMaxWidth(frameWidth, frameHeight)
  const logoPng = await sharp(logoBuffer, { failOn: 'none' })
    .ensureAlpha()
    .resize({ width: maxW, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer()

  const meta = await sharp(logoPng).metadata()
  const lw = meta.width ?? maxW
  const lh = meta.height ?? Math.round(maxW * 0.35)
  const padY = Math.max(landscape ? 18 : LOGO_MARGIN, Math.round(lh * PLATE_PAD_Y_RATIO))
  const padX = landscape ? Math.round(lw * 0.18) : 0
  const plateW = landscape ? lw + padX * 2 : frameWidth
  const plateH = lh + padY * 2
  const radius = landscape ? Math.round(Math.min(plateW, plateH) * 0.2) : 0

  const plateSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${plateW}" height="${plateH}">
      <rect x="0" y="0" width="${plateW}" height="${plateH}" rx="${radius}" ry="${radius}"
        fill="black" fill-opacity="${PLATE_OPACITY}"/>
    </svg>`,
  )

  const logoLeft = landscape ? padX : Math.round((plateW - lw) / 2)
  const logoTop = padY

  const png = await sharp({
    create: {
      width: plateW,
      height: plateH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: await sharp(plateSvg).png().toBuffer(), left: 0, top: 0 },
      { input: logoPng, left: logoLeft, top: logoTop },
    ])
    .png()
    .toBuffer()

  return { png, fullWidthPlate: !landscape }
}

export async function applyLogoOverlayToVideo(
  videoBuffer: Buffer,
  logoBuffer: Buffer,
  logoFileName: string,
  position: ReelLogoPosition,
  frameWidth = 1080,
  timing?: OverlayTimingOptions,
  frameHeight?: number,
): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), 'reels-logo-'))
  const videoPath = join(workDir, 'input.mp4')
  const logoPath = join(workDir, 'logo-watermark.png')
  const outputPath = join(workDir, 'branded.mp4')
  const ffmpeg = await resolveFfmpegBinary()
  const prepared = await prepareWatermarkLogoPng(logoBuffer, frameWidth, frameHeight)
  const coords = overlayCoords(position, prepared.fullWidthPlate)
  const enableFrom = timing?.enableFromSeconds
  const enableUntil = timing?.enableUntilSeconds
  const hasFrom = typeof enableFrom === 'number' && Number.isFinite(enableFrom) && enableFrom > 0
  const hasUntil = typeof enableUntil === 'number' && Number.isFinite(enableUntil) && enableUntil > 0
  let enableExpr = ''
  if (hasFrom && hasUntil) {
    enableExpr = `:enable='gte(t\\,${enableFrom!.toFixed(3)})*lt(t\\,${enableUntil!.toFixed(3)})'`
  } else if (hasFrom) {
    enableExpr = `:enable='gte(t\\,${enableFrom!.toFixed(3)})'`
  } else if (hasUntil) {
    enableExpr = `:enable='lt(t\\,${enableUntil!.toFixed(3)})'`
  }
  const filter = `[1:v]format=rgba[lg];[0:v][lg]overlay=${coords}${enableExpr}`

  try {
    await writeFile(videoPath, videoBuffer)
    void logoFileName
    await writeFile(logoPath, prepared.png)

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
