/** Shared video encode settings for AI Reels Maker output.
 *
 * Tuned for social delivery speed. Override via env without redeploying code:
 *   REEL_VIDEO_CRF=17|20|23
 *   REEL_VIDEO_PRESET=ultrafast|veryfast|fast|medium
 *   REEL_PRESCALE=1.12|1.15|1.28
 */

function envString(name: string, fallback: string) {
  const raw = process.env[name]?.trim()
  return raw ? raw : fallback
}

function envNumber(name: string, fallback: number) {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** 20 = strong social quality at ~1.5–2× faster than CRF 17. Use 17 for max quality. */
export const REEL_VIDEO_CRF = envString('REEL_VIDEO_CRF', '20')
/** veryfast encodes much quicker than fast with only a small quality drop on 1080p reels. */
export const REEL_VIDEO_PRESET = envString('REEL_VIDEO_PRESET', 'veryfast')
export const REEL_SCALE_FLAGS = 'lanczos+accurate_rnd+full_chroma_int'

/** Extra headroom for cinematic dolly/push before cropping to the final frame.
 *  1.15× is enough for typical zoom (~1.08–1.12) with less pixel overhead than 1.28×. */
export const REEL_PRESCALE_MULTIPLIER = envNumber('REEL_PRESCALE', 1.15)

export function buildReelVideoEncodeArgs(fps: number) {
  return [
    '-c:v',
    'libx264',
    '-preset',
    REEL_VIDEO_PRESET,
    '-crf',
    REEL_VIDEO_CRF,
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(fps),
  ] as const
}

export function buildReelH264OutputArgs() {
  return ['-c:v', 'libx264', '-preset', REEL_VIDEO_PRESET, '-crf', REEL_VIDEO_CRF, '-pix_fmt', 'yuv420p'] as const
}
