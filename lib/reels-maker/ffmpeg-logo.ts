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

const LOGO_WIDTH_RATIO = 0.28
const LOGO_MARGIN = 32

function logoMaxWidth(frameWidth: number) {
  return Math.round(frameWidth * LOGO_WIDTH_RATIO)
}

function overlayCoords(position: ReelLogoPosition) {
  switch (position) {
    case 'top-left':
      return `${LOGO_MARGIN}:${LOGO_MARGIN}`
    case 'bottom-left':
      return `${LOGO_MARGIN}:main_h-overlay_h-${LOGO_MARGIN}`
    case 'bottom-right':
      return `main_w-overlay_w-${LOGO_MARGIN}:main_h-overlay_h-${LOGO_MARGIN}`
    case 'top-right':
    default:
      return `main_w-overlay_w-${LOGO_MARGIN}:${LOGO_MARGIN}`
  }
}

export async function applyLogoOverlayToVideo(
  videoBuffer: Buffer,
  logoBuffer: Buffer,
  logoFileName: string,
  position: ReelLogoPosition,
  frameWidth = 1080,
): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), 'reels-logo-'))
  const videoPath = join(workDir, 'input.mp4')
  const ext = extname(logoFileName).toLowerCase() || '.png'
  const logoPath = join(workDir, `logo${ext}`)
  const outputPath = join(workDir, 'branded.mp4')
  const ffmpeg = await resolveFfmpegBinary()
  const coords = overlayCoords(position)
  const filter = `[1:v]scale='min(${logoMaxWidth(frameWidth)}\\,iw)':-1[lg];[0:v][lg]overlay=${coords}`

  try {
    await writeFile(videoPath, videoBuffer)
    await writeFile(logoPath, logoBuffer)

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
      { maxBuffer: 1024 * 1024 * 64 },
    )

    return readFile(outputPath)
  } finally {
    await safeRemoveDir(workDir)
  }
}
