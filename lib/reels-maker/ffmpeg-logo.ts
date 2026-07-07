import { execFile } from 'child_process'
import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { extname } from 'path'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'

import { resolveFfmpegBinary } from '@/lib/reels-maker/audio-utils'
import { safeRemoveDir } from '@/lib/reels-maker/safe-rm'
import type { ReelLogoPosition } from '@/lib/reels-maker/types'

const execFileAsync = promisify(execFile)

const OUTPUT_WIDTH = 1080
/** Logo width as a fraction of the 1080px reel frame (was 18% — too small for branding). */
const LOGO_WIDTH_RATIO = 0.28
const LOGO_MAX_WIDTH = Math.round(OUTPUT_WIDTH * LOGO_WIDTH_RATIO)
const LOGO_MARGIN = 32

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
): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), 'reels-logo-'))
  const videoPath = join(workDir, 'input.mp4')
  const ext = extname(logoFileName).toLowerCase() || '.png'
  const logoPath = join(workDir, `logo${ext}`)
  const outputPath = join(workDir, 'branded.mp4')
  const ffmpeg = await resolveFfmpegBinary()
  const coords = overlayCoords(position)
  const filter = `[1:v]scale='min(${LOGO_MAX_WIDTH}\\,iw)':-1[lg];[0:v][lg]overlay=${coords}`

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
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
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
