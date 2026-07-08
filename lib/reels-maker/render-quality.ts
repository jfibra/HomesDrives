/** Shared high-quality video encode settings for AI Reels Maker output. */
export const REEL_VIDEO_CRF = '17'
export const REEL_VIDEO_PRESET = 'medium'
export const REEL_SCALE_FLAGS = 'lanczos+accurate_rnd+full_chroma_int'

/** Extra headroom for Ken Burns zoom/pan before cropping to the final frame. */
export const REEL_PRESCALE_MULTIPLIER = 2

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
