/** Shared high-quality video encode settings for AI Reels Maker output. */
export const REEL_VIDEO_CRF = '17'
export const REEL_VIDEO_PRESET = 'fast'
export const REEL_SCALE_FLAGS = 'lanczos+accurate_rnd+full_chroma_int'

/** Extra headroom for cinematic dolly/push before cropping to the final frame.
 *  Max zoom ~1.14×, so 1.28× gives safe margin without extreme pixel overhead. */
export const REEL_PRESCALE_MULTIPLIER = 1.28

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
